
import { Product, Coupon, OrderBumpOffer, UpsellOffer, ProductCheckoutCustomization } from '@/types'; 
import { supabase, getSupabaseUserId } from '@/supabaseClient';  
import { Database, Json } from '@/types/supabase'; 

type ProductRow = Database['public']['Tables']['products']['Row'];
type ProductInsert = Database['public']['Tables']['products']['Insert'];
type ProductUpdate = Database['public']['Tables']['products']['Update'];

const generateSlugFromName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-') 
    .replace(/[^\w-]+/g, '') 
    .replace(/--+/g, '-') 
    .substring(0, 50) + `-${Math.random().toString(36).substring(2, 7)}`; 
};

const parseJsonField = <T>(field: Json | null | undefined, defaultValue: T): T => {
  if (field === null || field === undefined) {
    return defaultValue;
  }
  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T;
    } catch (e) {
      console.warn('Failed to parse JSON string field:', field, e);
      return defaultValue;
    }
  }
  return field as T; 
};

const fromSupabaseRow = (row: ProductRow): Product => {
  return {
    id: row.id,
    platformUserId: row.platform_user_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceInCents: row.price_in_cents,
    imageUrl: row.image_url || undefined,
    checkoutCustomization: parseJsonField<ProductCheckoutCustomization>(row.checkout_customization, {}),
    deliveryUrl: row.delivery_url || undefined,
    totalSales: row.total_sales || 0,
    clicks: row.clicks || 0,
    checkoutViews: row.checkout_views || 0,
    conversionRate: row.conversion_rate || 0,
    abandonmentRate: row.abandonment_rate || 0,
    orderBump: parseJsonField<OrderBumpOffer | undefined>(row.order_bump, undefined),
    upsell: parseJsonField<UpsellOffer | undefined>(row.upsell, undefined),
    coupons: parseJsonField<Coupon[]>(row.coupons, []),
  };
};


export const productService = {
  getProducts: async (_token: string | null): Promise<Product[]> => {
    const userId = await getSupabaseUserId();
    if (!userId) {
        console.warn("productService.getProducts: User ID não encontrado. Retornando lista vazia.");
        return [];
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, platform_user_id, slug, name, description, price_in_cents, image_url, checkout_customization, delivery_url, total_sales, clicks, checkout_views, conversion_rate, abandonment_rate, order_bump, upsell, coupons, created_at, updated_at')
        .eq('platform_user_id', userId); 

      if (error) throw error;
      return data ? data.map(fromSupabaseRow) : [];
    } catch (error: any) {
      console.error('Supabase getProducts error:', error);
      throw new Error(error.message || 'Falha ao buscar produtos');
    }
  },

  getProductById: async (id: string, _token: string | null): Promise<Product | undefined> => {
    const logPrefix = `[productService.getProductById(${id.substring(0,8)})]`;
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, platform_user_id, slug, name, description, price_in_cents, image_url, checkout_customization, delivery_url, total_sales, clicks, checkout_views, conversion_rate, abandonment_rate, order_bump, upsell, coupons, created_at, updated_at')
        .eq('id', id)
        .single<ProductRow>();

      if (error) {
        console.error(`${logPrefix} Supabase error:`, error);
        if (error.code === 'PGRST116') { // No rows found
            console.warn(`${logPrefix} Product not found (PGRST116).`);
            return undefined; 
        }
        throw error;
      }
      if (!data) {
        console.warn(`${logPrefix} Product data is null but no error reported.`);
        return undefined;
      }
      console.log(`${logPrefix} Product data fetched successfully.`);
      return fromSupabaseRow(data);
    } catch (error: any) {
      console.error(`${logPrefix} General exception:`, error);
      throw new Error(error.message || 'Falha ao buscar produto');
    }
  },

  getProductBySlug: async (slug: string, _token: string | null): Promise<Product | undefined> => {
    const logPrefix = `[productService.getProductBySlug(${slug})]`;
    const currentUserId = await getSupabaseUserId(); // Log current auth state for context
    console.log(`${logPrefix} Attempting to fetch. Current auth user ID (for context): ${currentUserId || 'Anonymous'}`);

    try {
      const { data, error, status } = await supabase
        .from('products')
        .select('id, platform_user_id, slug, name, description, price_in_cents, image_url, checkout_customization, delivery_url, total_sales, clicks, checkout_views, conversion_rate, abandonment_rate, order_bump, upsell, coupons, created_at, updated_at')
        .eq('slug', slug)
        .single<ProductRow>(); // .single() will error if more than one row, or if RLS prevents access to THE row.

      if (error) {
        console.error(`${logPrefix} Supabase error (Status: ${status}, Code: ${error.code}):`, error.message, error.details, error.hint);
        if (error.code === 'PGRST116') { // 0 rows found or RLS prevented access to the specific row
          console.warn(`${logPrefix} Product not found or access denied by RLS (PGRST116). This is expected for anonymous users if RLS is restrictive or slug is wrong.`);
          return undefined;
        }
        throw error;
      }
      
      if (!data) { // Should be caught by PGRST116, but as a safeguard.
        console.warn(`${logPrefix} Product data is null/undefined but no specific Supabase error reported (Status: ${status}). This might indicate an RLS issue silently preventing row access.`);
        return undefined;
      }
      
      console.log(`${logPrefix} Product data fetched successfully for slug. Product ID: ${data.id}`);
      return fromSupabaseRow(data);
    } catch (error: any) {
      console.error(`${logPrefix} General exception:`, error.message, error.stack);
      throw new Error(error.message || 'Falha ao buscar produto pelo slug');
    }
  },

  createProduct: async (
    productData: Omit<Product, 'id' | 'platformUserId' | 'totalSales' | 'clicks' | 'checkoutViews' | 'conversionRate' | 'abandonmentRate' | 'slug'>,
    _token: string | null
  ): Promise<Product> => {
    const userId = await getSupabaseUserId();
    if (!userId) throw new Error('Usuário não autenticado para criar produto.');

    const slug = generateSlugFromName(productData.name);

    const newProductData: ProductInsert = {
      platform_user_id: userId,
      slug: slug,
      name: productData.name,
      description: productData.description,
      price_in_cents: productData.priceInCents,
      image_url: productData.imageUrl === '' ? null : productData.imageUrl,
      checkout_customization: productData.checkoutCustomization as unknown as Json,
      delivery_url: productData.deliveryUrl === '' ? null : productData.deliveryUrl,
      order_bump: productData.orderBump as unknown as Json,
      upsell: productData.upsell as unknown as Json,
      coupons: productData.coupons as unknown as Json,
    };

    try {
      const { data, error } = await supabase
        .from('products')
        .insert(newProductData)
        .select()
        .single<ProductRow>();

      if (error) throw error;
      if (!data) throw new Error('Falha ao criar produto, dados não retornados.');
      return fromSupabaseRow(data);
    } catch (error: any) {
      console.error('Supabase createProduct error:', error);
      throw new Error(error.message || 'Falha ao criar produto');
    }
  },

  updateProduct: async (id: string, updates: Partial<Omit<Product, 'id' | 'platformUserId' | 'slug'>>, _token: string | null): Promise<Product | undefined> => {
    const userId = await getSupabaseUserId();
    if (!userId) throw new Error('Usuário não autenticado para atualizar produto.');
    
    const currentProduct = await productService.getProductById(id, _token); 
    if (!currentProduct) {
        throw new Error(`Produto com ID ${id} não encontrado para atualização.`);
    }

    const updatesForSupabase: ProductUpdate = {
        ...(updates.name && { name: updates.name }),
        ...(updates.description && { description: updates.description }),
        ...(updates.priceInCents !== undefined && { price_in_cents: updates.priceInCents }),
        ...(updates.imageUrl !== undefined && { image_url: updates.imageUrl === '' ? null : updates.imageUrl }),
        ...(updates.checkoutCustomization && { checkout_customization: updates.checkoutCustomization as unknown as Json }),
        ...(updates.deliveryUrl !== undefined && { delivery_url: updates.deliveryUrl === '' ? null : updates.deliveryUrl }),
        ...(updates.orderBump !== undefined && { order_bump: updates.orderBump as unknown as Json }),
        ...(updates.upsell !== undefined && { upsell: updates.upsell as unknown as Json }),
        ...(updates.coupons !== undefined && { coupons: updates.coupons as unknown as Json }),
    };
    
    if (updates.name && currentProduct.name !== updates.name) {
        updatesForSupabase.slug = generateSlugFromName(updates.name);
    }

    try {
      const { data, error } = await supabase 
        .from('products')
        .update(updatesForSupabase)
        .eq('id', id)
        .select()
        .single<ProductRow>();
        
      if (error) {
        if (error.code === 'PGRST116') return undefined; 
        throw error;
      }
      if (!data) throw new Error('Falha ao atualizar produto, dados não retornados.');
      return fromSupabaseRow(data);
    } catch (error: any) {
      console.error('Supabase updateProduct error:', error);
      throw new Error(error.message || 'Falha ao atualizar produto');
    }
  },

  deleteProduct: async (id: string, _token: string | null): Promise<boolean> => {
    const userId = await getSupabaseUserId();
    if (!userId) throw new Error('Usuário não autenticado para deletar produto.');
    try {
      const { error, count } = await supabase
        .from('products')
        .delete({ count: 'exact' }) 
        .eq('id', id);
        
      if (error) throw error;
      return count !== null && count > 0;
    } catch (error: any) {
      console.error('Supabase deleteProduct error:', error);
      throw new Error(error.message || 'Falha ao deletar produto');
    }
  },

  cloneProduct: async (id: string, token: string | null): Promise<Product | undefined> => {
    const userId = await getSupabaseUserId();
    if (!userId || !token) throw new Error('Usuário não autenticado para clonar produto.');

    try {
      const originalProduct = await productService.getProductById(id, token); 
      if (!originalProduct) throw new Error('Produto original não encontrado para clonar.');

      const {
        id: _id, platformUserId: _puid, slug: _slug, totalSales: _ts, clicks: _c,
        checkoutViews: _cv, conversionRate: _cr, abandonmentRate: _ar,
        ...clonableData
      } = originalProduct;
      
      const clonedProductData: Omit<Product, 'id' | 'platformUserId' | 'totalSales' | 'clicks' | 'checkoutViews' | 'conversionRate' | 'abandonmentRate' | 'slug'> = {
        ...clonableData,
        name: `${originalProduct.name} (Cópia)`,
      };
      return await productService.createProduct(clonedProductData, token); 
    } catch (error: any) {
      console.error('Supabase cloneProduct error:', error);
      throw new Error(error.message || 'Falha ao clonar produto');
    }
  }
};
