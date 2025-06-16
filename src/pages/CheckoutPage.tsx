
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
                    <div className="text