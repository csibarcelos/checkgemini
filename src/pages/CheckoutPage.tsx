
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from "react-router-dom"; // Standardized
import { v4 as uuidv4 } from 'uuid'; 
import { Product, PaymentStatus, Coupon, OrderBumpOffer, PushInPayPixResponseData, PushInPayPixResponse, AppSettings, PlatformSettings, SaleProductItem, PaymentMethod, Sale, UtmifyOrderPayload, AbandonedCartStatus, PushInPayPixRequest, PushInPayTransactionStatusResponse } from '@/types'; 
import { productService } from '@/services/productService';
import { abandonedCartService, CreateAbandonedCartPayload } from '@/services/abandonedCartService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { CheckCircleIcon, PHONE_COUNTRY_CODES, DocumentDuplicateIcon, TagIcon, MOCK_WEBHOOK_URL, PLATFORM_NAME } from '@/constants'; 
import { settingsService } from '@/services/settingsService';
import { salesService } from '@/services/salesService';
import { utmifyService } from '@/services/utmifyService';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/supabaseClient'; 


const LockClosedIconSolid: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" {...props}>
    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002 2v-7a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
  </svg>
);

const formatCurrency = (valueInCents: number): string => {
    return `R$ ${(valueInCents / 100).toFixed(2).replace('.', ',')}`;
};

const formatPhoneNumberVisual = (digits: string): string => {
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

const getContrastingTextColor = (hexColor?: string): string => {
    if (!hexColor) return '#111827'; 
    try {
      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? '#111827' : '#FFFFFF'; 
    } catch (e) {
      return '#111827'; 
    }
};

const LOCALSTORAGE_CHECKOUT_KEY = 'checkoutFormData';
const POLLING_INTERVAL = 5000; 
const POLLING_TIMEOUT_DURATION = 5 * 60 * 1000; 

interface CheckoutPageUIProps {
  product: Product | null;
  customerName: string;
  handleCustomerNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  customerEmail: string;
  handleCustomerEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  rawWhatsappNumber: string;
  handleWhatsappInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  customerWhatsappCountryCode: string;
  handleCountryCodeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  couponCodeInput: string;
  handleCouponCodeInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleApplyCoupon: () => void;
  couponError: string | null;
  appliedCoupon: Coupon | null;
  finalPrice: number | null;
  originalPriceBeforeDiscount: number | null;
  discountApplied: number;
  includeOrderBump: boolean;
  handleToggleOrderBump: () => void;
  isSubmitting: boolean;
  handlePayWithPix: () => Promise<void>;
  pixData: PushInPayPixResponseData | null;
  copyPixCode: () => void;
  copySuccess: boolean;
  paymentStatus: PaymentStatus | null;
  error: string | null;
  getPrimaryColor: () => string;
  getCtaTextColor: () => string;
  isPollingPayment: boolean;
  clearAppliedCoupon: () => void;
  removeOrderBump: () => void;
  setPixData: React.Dispatch<React.SetStateAction<PushInPayPixResponseData | null>>;
  setPaymentStatus: React.Dispatch<React.SetStateAction<PaymentStatus | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  hasLeftContent: boolean;
}

const CheckoutPageUI: React.FC<CheckoutPageUIProps> = ({
  product, customerName, handleCustomerNameChange, customerEmail, handleCustomerEmailChange,
  rawWhatsappNumber, handleWhatsappInputChange, customerWhatsappCountryCode, handleCountryCodeChange,
  couponCodeInput, handleCouponCodeInputChange, handleApplyCoupon, couponError, appliedCoupon,
  finalPrice, originalPriceBeforeDiscount, discountApplied,
  includeOrderBump, handleToggleOrderBump, isSubmitting, handlePayWithPix,
  pixData, copyPixCode, copySuccess, paymentStatus, error, getPrimaryColor, getCtaTextColor,
  isPollingPayment, clearAppliedCoupon, removeOrderBump,
  setPixData, setPaymentStatus, setError: setGeneralError, hasLeftContent
}) => {
  if (!product || finalPrice === null || originalPriceBeforeDiscount === null) {
    return <div className="text-center p-8 text-neutral-600">Carregando informações do produto...</div>;
  }
  const primaryColor = getPrimaryColor();
  const ctaTextColor = getCtaTextColor();

  return (
    <div className="checkout-light-theme min-h-screen">
      <style>{`:root { --checkout-color-primary-DEFAULT: ${primaryColor}; --checkout-color-primary-cta-text: ${ctaTextColor}; }`}</style>
      <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
        <header className="mb-8 text-center">
          {product.checkoutCustomization?.logoUrl ? (
            <img src={product.checkoutCustomization.logoUrl} alt={`${product.name} Logo`} className="h-16 md:h-20 mx-auto mb-4 object-contain" />
          ) : (
            <h1 className="text-3xl md:text-4xl font-extrabold" style={{ color: primaryColor }}>{product.name}</h1>
          )}
        </header>

        <div className={`grid ${hasLeftContent ? 'grid-cols-1 lg:grid-cols-2' : 'lg:grid-cols-1 justify-items-center'} gap-8 items-start`}>
          <div className={`space-y-6 w-full ${!hasLeftContent ? 'lg:hidden' : ''}`}>
            {product.checkoutCustomization?.videoUrl && (
              <div className="aspect-video bg-neutral-800 rounded-lg shadow-lg overflow-hidden border border-neutral-300">
                <iframe
                  width="100%" height="100%" src={product.checkoutCustomization.videoUrl.replace("watch?v=", "embed/")}
                  title="Vídeo do Produto" frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            )}
            {!product.checkoutCustomization?.videoUrl && product.imageUrl && (
              <img src={product.imageUrl} alt={product.name} className="w-full rounded-lg shadow-lg object-cover max-h-80 border border-neutral-300" />
            )}

            {product.checkoutCustomization?.salesCopy && product.checkoutCustomization.salesCopy.replace(/<[^>]*>?/gm, '').trim() !== '' && (
              <Card className="card-checkout-specific">
                <div 
                    className="prose prose-sm sm:prose-base max-w-none" 
                    dangerouslySetInnerHTML={{ __html: product.checkoutCustomization.salesCopy }} 
                />
              </Card>
            )}

            {product.checkoutCustomization?.testimonials && product.checkoutCustomization.testimonials.length > 0 && (
              <Card title="O que nossos clientes dizem" className="card-checkout-specific">
                <div className="space-y-4">
                  {product.checkoutCustomization.testimonials.map((testimonial, index) => (
                    <blockquote key={index} className="p-3 bg-neutral-50 rounded-md border border-neutral-200">
                      <p className="italic">"{testimonial.text}"</p>
                      <footer className="mt-2 text-sm font-medium">- {testimonial.author}</footer>
                    </blockquote>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className={`space-y-6 w-full ${hasLeftContent ? 'lg:sticky lg:top-8' : 'lg:max-w-xl'}`}>
            <Card className="card-checkout-specific">
                <div className="flex justify-between items-baseline mb-2">
                    <h2 className="text-xl font-semibold">Resumo do Pedido</h2>
                    {product.checkoutCustomization?.countdownTimer?.enabled && (
                         <div id="checkout-countdown-timer" className="text-sm font-medium px-2 py-1 rounded">
                         </div>
                    )}
                </div>
              <div className="border-b border-neutral-200 pb-3 mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span>{product.name}</span>
                  <span className="font-semibold">{formatCurrency(product.priceInCents)}</span>
                </div>
                {product.orderBump && includeOrderBump && (
                  <div className="flex justify-between items-center text-sm my-1.5 py-1.5 border-t border-neutral-200">
                    <div className="flex items-center">
                        <span>{product.orderBump.name} <span className="text-xs" style={{color: primaryColor}}>(Oferta Adicional!)</span></span>
                    </div>
                    <span className="font-medium">
                        {product.orderBump.customPriceInCents !== undefined ? formatCurrency(product.orderBump.customPriceInCents) : "Preço Ind."}
                    </span>
                  </div>
                )}
                {discountApplied > 0 && appliedCoupon && (
                  <div className="flex justify-between items-center text-sm text-red-600 my-1.5 py-1.5 border-t border-dashed border-red-300">
                    <span>Desconto ({appliedCoupon.code})</span>
                    <span>-{formatCurrency(discountApplied)}</span>
                  </div>
                )}
                 <div className="flex justify-between items-center mt-2 pt-2 border-t border-neutral-300">
                    <span className="text-lg font-bold">Total:</span>
                    <div className="text-right">
                        {originalPriceBeforeDiscount !== finalPrice && (
                             <span className="block text-xs line-through">{originalPriceBeforeDiscount !== null ? formatCurrency(originalPriceBeforeDiscount) : ''}</span>
                        )}
                        <span className="text-xl font-bold" style={{color: primaryColor}}>{finalPrice !== null ? formatCurrency(finalPrice) : '...'}</span>
                    </div>
                </div>
              </div>

                {product.orderBump && !pixData && (
                    <div className="my-5 p-4 rounded-lg border-2" style={{borderColor: primaryColor, backgroundColor: `${primaryColor}1A`}}>
                        <h3 className="text-lg font-semibold mb-2" style={{color: primaryColor}}>OFERTA ESPECIAL! <span className="text-neutral-800">Adicionar "{product.orderBump.name}"?</span></h3>
                        <p className="text-sm mb-2">{product.orderBump.description}</p>
                        <div className="flex items-center justify-between">
                            <p className="text-lg font-bold" style={{color: primaryColor}}>
                                + {formatCurrency(product.orderBump.customPriceInCents !== undefined ? product.orderBump.customPriceInCents : 0)}
                            </p>
                            <label htmlFor="orderBumpToggle" className="flex items-center cursor-pointer">
                                <div className="relative">
                                    <input type="checkbox" id="orderBumpToggle" className="sr-only" checked={includeOrderBump} onChange={handleToggleOrderBump} disabled={isSubmitting || !!pixData} />
                                    <div className={`block w-12 h-7 rounded-full transition-colors ${includeOrderBump ? 'bg-opacity-100' : 'bg-neutral-300'}`} style={{backgroundColor: includeOrderBump ? primaryColor : undefined}}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${includeOrderBump ? 'translate-x-full' : ''}`}></div>
                                </div>
                                <div className="ml-3 text-sm font-medium">{includeOrderBump ? 'Sim!' : 'Não'}</div>
                            </label>
                        </div>
                         {includeOrderBump && <button onClick={removeOrderBump} className="text-xs text-red-500 hover:underline mt-1" disabled={isSubmitting || !!pixData}>Remover oferta</button>}
                    </div>
                )}

              {pixData ? (
                <div className="space-y-4 text-center">
                  <h3 className="text-xl font-semibold" style={{color: primaryColor}}>Pague com PIX para finalizar!</h3>
                  {paymentStatus === PaymentStatus.WAITING_PAYMENT && (
                    <>
                      <img src={`data:image/png;base64,${pixData.qr_code_base64}`} alt="PIX QR Code" className="mx-auto w-56 h-56 rounded-md border-2 p-1 bg-white" style={{borderColor: primaryColor}} />
                      <div className="relative">
                        <Input name="pixCode" readOnly value={pixData.qr_code} className="input-checkout-specific pr-10 text-xs text-center"/>
                        <Button type="button" onClick={copyPixCode} variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-[var(--checkout-color-primary-DEFAULT)]">
                          {copySuccess ? <CheckCircleIcon className="h-5 w-5 text-green-500"/> : <DocumentDuplicateIcon className="h-5 w-5"/>}
                        </Button>
                      </div>
                      {copySuccess && <p className="text-xs text-green-600">Código PIX copiado!</p>}
                      <p className="text-sm">Escaneie o QR Code ou copie o código acima.</p>
                      {isPollingPayment && <div className="flex items-center justify-center text-sm">Verificando pagamento...</div>}
                    </>
                  )}
                  {paymentStatus === PaymentStatus.PAID && (
                    <div className="p-4 bg-green-50 rounded-md border border-green-200">
                      <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-2" />
                      <p className="text-lg font-semibold text-green-700">Pagamento Confirmado!</p>
                      <p className="text-sm">Você será redirecionado em instantes...</p>
                    </div>
                  )}
                   {(paymentStatus === PaymentStatus.FAILED || paymentStatus === PaymentStatus.EXPIRED || paymentStatus === PaymentStatus.CANCELLED) && !isPollingPayment && (
                     <div className="mt-6 text-center">
                       <p className="text-red-500 mb-2">{error || `O pagamento PIX ${paymentStatus === PaymentStatus.EXPIRED ? 'expirou' : 'falhou/foi cancelado'}.`}</p>
                       <Button
                         onClick={() => { setPixData(null); setPaymentStatus(null); setGeneralError(null); handlePayWithPix(); }}
                         disabled={isSubmitting}
                         className="button-checkout-specific primary w-full"
                       >
                         {isSubmitting ? "Processando..." : "Tentar Novamente com PIX"}
                       </Button>
                     </div>
                   )}
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); handlePayWithPix(); }} className="space-y-4">
                  <div>
                    <Input label="Nome Completo" name="customerName" type="text" value={customerName} onChange={handleCustomerNameChange} required disabled={isSubmitting} className="input-checkout-specific" />
                  </div>
                  <div>
                    <Input label="E-mail Principal" name="customerEmail" type="email" value={customerEmail} onChange={handleCustomerEmailChange} required disabled={isSubmitting} className="input-checkout-specific" />
                  </div>
                  <div>
                     <label htmlFor="customerWhatsapp" className="block text-sm font-medium mb-1">WhatsApp</label>
                    <div className="flex">
                        <select 
                            name="customerWhatsappCountryCode" 
                            value={customerWhatsappCountryCode} 
                            onChange={handleCountryCodeChange}
                            className="select-checkout-specific rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--checkout-color-primary-DEFAULT)] focus:border-[var(--checkout-color-primary-DEFAULT)] w-32"
                            disabled={isSubmitting}
                        >
                            {PHONE_COUNTRY_CODES.map(cc => <option key={cc.value} value={cc.value}>{cc.emoji} {cc.value}</option>)}
                        </select>
                        <Input name="customerWhatsapp" type="tel" value={rawWhatsappNumber} onChange={handleWhatsappInputChange} placeholder="(XX) XXXXX-XXXX" required disabled={isSubmitting} className="input-checkout-specific rounded-l-none flex-1" />
                    </div>
                  </div>
                  
                  {!appliedCoupon && product.coupons && product.coupons.length > 0 && (
                    <div className="pt-3">
                        <label htmlFor="couponCode" className="block text-sm font-medium mb-1">Cupom de Desconto</label>
                        <div className="flex items-center gap-2">
                            <Input name="couponCode" type="text" value={couponCodeInput} onChange={handleCouponCodeInputChange} placeholder="Seu cupom aqui" disabled={isSubmitting} icon={<TagIcon className="h-5 w-5 text-neutral-400"/>} className="input-checkout-specific flex-grow"/>
                            <Button type="button" onClick={handleApplyCoupon} variant="outline" size="md" disabled={isSubmitting || !couponCodeInput.trim()} className="button-checkout-specific outline flex-shrink-0">Aplicar</Button>
                        </div>
                        {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
                    </div>
                  )}
                   {appliedCoupon && (
                    <div className="p-2 bg-green-50 border border-green-200 rounded-md text-sm">
                        <p className="text-green-700 font-medium">Cupom "{appliedCoupon.code}" aplicado! <button type="button" onClick={clearAppliedCoupon} className="ml-1 text-red-500 text-xs hover:underline">(Remover)</button></p>
                    </div>
                  )}

                  {error && <p className="text-sm text-red-500 p-2 bg-red-50 rounded-md border border-red-300">{error}</p>}
                  
                  <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: primaryColor, color: ctaTextColor }} className="button-checkout-specific primary w-full text-lg py-3 mt-2">
                    {isSubmitting ? (
                        "Processando Pagamento..."
                    ) : (
                        <>
                            <LockClosedIconSolid className="h-5 w-5 mr-2" />
                            Pagar com PIX {finalPrice !== null ? formatCurrency(finalPrice) : '...'}
                        </>
                    )}
                  </Button>
                </form>
              )}
               <p className="text-xs mt-4 text-center flex items-center justify-center">
                <LockClosedIconSolid className="h-4 w-4 mr-1"/> Ambiente 100% seguro. Seus dados estão protegidos.
              </p>
            </Card>
            
            {product.checkoutCustomization?.guaranteeBadges && product.checkoutCustomization.guaranteeBadges.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                {product.checkoutCustomization.guaranteeBadges.map((badge: { id: string; imageUrl: string; altText: string; }) => (
                  <div key={badge.id} className="bg-white p-2 rounded-md shadow-sm border border-neutral-200 flex items-center justify-center">
                    <img src={badge.imageUrl} alt={badge.altText} className="max-h-16 object-contain" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <footer className="mt-12 pt-6 border-t border-neutral-300 text-center">
            <p className="text-xs">&copy; {new Date().getFullYear()} {product.name}. Todos os direitos reservados.</p>
            <p className="text-xs mt-1">Processado por {PLATFORM_NAME}.</p>
        </footer>
      </div>
    </div>
  );
};


export const CheckoutPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [product, setProduct] = useState<Product | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);

  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerWhatsappCountryCode, setCustomerWhatsappCountryCode] = useState(PHONE_COUNTRY_CODES[0].value);
  const [rawWhatsappNumber, setRawWhatsappNumber] = useState('');
  
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [includeOrderBump, setIncludeOrderBump] = useState(false);
  
  const [final