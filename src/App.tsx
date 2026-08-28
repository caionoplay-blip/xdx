/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useState, useRef, useEffect } from 'react';
import { Camera, Trash2, ShoppingCart, Loader2, X, Check, Zap, LogOut, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { scanPriceTag, ProductInfo } from './services/gemini';
import { AdMob, InterstitialAdPluginEvents, AdLoadInfo } from '@capacitor-community/admob';
import { Device } from '@capacitor/device';
import { InstallButton } from './components/InstallPWA';
import { getUserId, fetchProfile as fetchProfileSql, upsertProfile, deleteProfile, fetchSessionItems, fetchHistoryItems, fetchLastPrice, insertItem, updateItem, deleteItem, deleteSessionItems, finalizeSession } from './services/sqlClient';
// Garante que InstallButton não seja removido pelo tree-shaking (bug jsx automatic em prod)
if (typeof window !== 'undefined') (window as any).__XDX_KEEP_INSTALL_BUTTON = InstallButton;

const XDXLogo = ({ className = "w-12 h-12", onClick }: { className?: string, onClick?: () => void }) => (
  <svg onClick={onClick} viewBox="0 0 100 115" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="5" width="84" height="105" rx="20" fill="#003d4d" stroke="#10b981" strokeWidth="1.5" />
    <g>
      <rect x="18" y="15" width="64" height="32" rx="8" fill="#bbf7d0" />
      <text x="50" y="38" fontSize="20" fontWeight="900" fill="#003d4d" textAnchor="middle" fontFamily="sans-serif">XĐX</text>
    </g>
    <g transform="translate(18, 54)">
      <rect x="0" y="0" width="14" height="10" rx="3" fill="#ef4444" opacity="0.9" />
      <rect x="18" y="0" width="14" height="10" rx="3" fill="#005d75" />
      <rect x="36" y="0" width="14" height="10" rx="3" fill="#005d75" />
      <rect x="54" y="0" width="14" height="10" rx="3" fill="#10b981" />
      <rect x="0" y="15" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="18" y="15" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="36" y="15" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="54" y="15" width="14" height="10" rx="3" fill="#10b981" />
      <rect x="0" y="30" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="18" y="30" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="36" y="30" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="54" y="30" width="14" height="10" rx="3" fill="#10b981" />
      <rect x="0" y="45" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="18" y="45" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="36" y="45" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="54" y="45" width="14" height="10" rx="3" fill="#10b981" />
      <rect x="0" y="60" width="32" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="36" y="60" width="14" height="10" rx="3" fill="#10b981" opacity="0.6" />
      <rect x="54" y="60" width="14" height="10" rx="3" fill="#10b981" />
    </g>
  </svg>
);

// Error Boundary Component
class ErrorBoundary extends (Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("App Crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
          <XDXLogo className="w-16 h-16 mb-6 opacity-50" />
          <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase italic tracking-tighter">Ops! Algo deu errado</h2>
          <button onClick={() => window.location.reload()} className="bg-emerald text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg">Recarregar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface CartItem extends ProductInfo {
  id: string;
  quantity: number;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  // --- UI STATE ---
  const [items, setItems] = useState<CartItem[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'dashboard'>('list');
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<ProductInfo | null>(null);
  const [lastCapturedImage, setLastCapturedImage] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [scanCount, setScanCount] = useState(0); // Para controle do AdMob
  
  // --- ADMOB INIT ---
  useEffect(() => {
    const initAdMob = async () => {
      try {
        const info = await Device.getInfo();
        if (info.platform === 'web') return; // Não carrega anúncios no navegador dev

        await AdMob.initialize({ requestTrackingAuthorization: true });
        
        // Listener para fechar o anúncio e continuar
        AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
          console.log('Ad Dismissed');
        });

        // Pré-carrega o anúncio usando IDs de produção se disponíveis
        const adId = info.platform === 'ios' 
           ? (import.meta.env.VITE_ADMOB_AD_UNIT_ID_IOS || 'ca-app-pub-3940256099942544/4411468910')
           : (import.meta.env.VITE_ADMOB_AD_UNIT_ID_ANDROID || 'ca-app-pub-3940256099942544/1033173712');
           
        await AdMob.prepareInterstitial({ adId });
      } catch (e) {
        console.error('AdMob Init Error:', e);
      }
    };
    initAdMob();
  }, []);

  const showAdIfReady = async () => {
    try {
      const info = await Device.getInfo();
      if (info.platform === 'web') return;
      
      // Mostrar anúncio a cada 3 scans
      if ((scanCount + 1) % 3 === 0) {
        await AdMob.showInterstitial();
        // Prepara o próximo
        const adId = info.platform === 'ios' 
           ? (import.meta.env.VITE_ADMOB_AD_UNIT_ID_IOS || 'ca-app-pub-3940256099942544/4411468910')
           : (import.meta.env.VITE_ADMOB_AD_UNIT_ID_ANDROID || 'ca-app-pub-3940256099942544/1033173712');
        await AdMob.prepareInterstitial({ adId });
      }
      setScanCount(prev => prev + 1);
    } catch (e) {
      console.warn('AdMob Show Error (Silent):', e);
    }
  };
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [storeName, setStoreName] = useState<string>('Mercado XĐX');
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [hasSetStore, setHasSetStore] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(() => !localStorage.getItem('xdx_terms_accepted'));
  const [budgetLimit, setBudgetLimit] = useState<number | null>(null);
  
  // Helper para B2B: Inferir prateleira/categoria
  const inferCategory = (name: string): string => {
    const n = name.toLowerCase();
    if (['leite','queijo','iogurte','manteiga','requeijão','nata'].some(k => n.includes(k))) return 'Laticínios';
    if (['carne','frango','peixe','linguiça','bacon','presunto','bife'].some(k => n.includes(k))) return 'Carnes';
    if (['suco','refrigerante','água','cerveja','vinho','energético'].some(k => n.includes(k))) return 'Bebidas';
    if (['detergente','sabão','amaciante','desinfetante','alvejante','limpador'].some(k => n.includes(k))) return 'Limpeza';
    if (['shampoo','creme','desodorante','sabonete','pasta','escova'].some(k => n.includes(k))) return 'Higiene';
    if (['arroz','feijão','macarrão','farinha','aveia','milho'].some(k => n.includes(k))) return 'Grãos/Massas';
    if (['biscoito','bolacha','chocolate','doce','sorvete'].some(k => n.includes(k))) return 'Snacks/Doces';
    if (['pão','bolo','torta','croissant','bisnaguinha'].some(k => n.includes(k))) return 'Padaria';
    return 'Outros';
  };
  
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  

  const logoClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogoClick = () => {
    // Logo is now just decorative in the mobile app
  };
  const [lifetimeSavings, setLifetimeSavings] = useState(0);
  const [lastPriceInfo, setLastPriceInfo] = useState<{ price: number; store: string } | null>(null);

  // --- AUTH STATE (SQL) ---
  const [userId] = useState<string>(() => getUserId());
  const [session, setSession] = useState<any>(() => ({ user: { id: getUserId() } }));
  const [profile, setProfile] = useState<any>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState({
    full_name: '',
    phone: '',
    city: '',
    state: '',
    birth_date: '',
    email: ''
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // --- REFS ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>({ user: { id: getUserId() } });
  const [pendingItems, setPendingItems] = useState<any[]>([]);

  // --- INITIALIZATION (SQL) ---
  useEffect(() => {
    const uid = getUserId();
    sessionRef.current = { user: { id: uid } };
    setSession({ user: { id: uid } });
    fetchProfileLocal(uid);
    fetchItems();

    // Forced accessibility styles
    const style = document.createElement('style');
    style.innerHTML = `
      :root, html, body { background-color: #ffffff !important; color: #1a202c !important; color-scheme: light !important; }
      * { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif !important; }
    `;
    document.head.appendChild(style);

    return () => {
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, []);

  const fetchProfileLocal = async (userId: string) => {
    const data = await fetchProfileSql(userId);
    if (data) {
      setProfile(data);
      if (data.full_name) {
         const parts = data.full_name.split(' ');
         setFirstName(parts[0] || '');
         setLastName(parts.slice(1).join(' ') || '');
      }
      if (data.phone) setPhone(data.phone);
      if (!data.full_name) setIsOnboarding(true);
      else setIsOnboarding(false);
    } else {
      await upsertProfile(userId, { full_name: '', phone: '' });
      setIsOnboarding(true);
    }
  };

  const saveOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = getUserId();
    setAuthLoading(true);
    try {
      const fullName = `${firstName} ${lastName}`.trim();
      await upsertProfile(uid, { full_name: fullName, phone: phone });
      await fetchProfileLocal(uid);
      setIsOnboarding(false);
      setMessage({ type: 'success', text: 'Perfil salvo com sucesso!' });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Falha interna ao salvar perfil.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchItems = async () => {
    const uid = getUserId();
    const data = await fetchSessionItems(uid);
    setItems(data.map(i => ({ ...i, rawText: i.raw_text || i.rawText })));
  };

  const fetchRecentTrips = async () => {
    const uid = getUserId();
    const data = await fetchHistoryItems(uid);
    if (data) {
      let lifetime = 0;
      const tripsMap = new Map();
      data.forEach(item => {
        if (!item.trip_id) return;
        if (!tripsMap.has(item.trip_id)) {
          tripsMap.set(item.trip_id, { 
             id: item.trip_id, 
             date: new Date(item.created_at).toLocaleDateString('pt-BR'), 
             store: item.store_name, 
             total: 0, 
             count: 0, 
             target_budget: item.target_budget || 0,
             saved: 0 
          });
        }
        const trip = tripsMap.get(item.trip_id);
        trip.total += item.price * item.quantity;
        trip.count += item.quantity;
      });
      Array.from(tripsMap.values()).forEach((trip: any) => {
         if (trip.target_budget > 0) {
            trip.saved = trip.target_budget - trip.total;
            lifetime += trip.saved;
         }
      });
      setLifetimeSavings(lifetime);
      setRecentTrips(Array.from(tripsMap.values()).slice(0, 3));
    }
  };



  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    if (showProfileModal) fetchRecentTrips();
  }, [showProfileModal]);

  const checkLastPrice = async (name: string) => {
    const uid = getUserId();
    if (!uid || !name) return;
    const data = await fetchLastPrice(uid, name);
    if (data) setLastPriceInfo({ price: data.price, store: data.store_name });
    else setLastPriceInfo(null);
  };

  useEffect(() => {
    if (scannedProduct?.name) checkLastPrice(scannedProduct.name);
  }, [scannedProduct]);

  const handleLogout = async () => {
    if (window.confirm('Ao sair, seus dados locais serão mantidos mas você verá a tela inicial. Continuar?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  // --- CAMERA LOGIC ---
  useEffect(() => {
    if (isCameraOpen) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [isCameraOpen]);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities() as any;
        setHasTorch(!!caps.torch);
        setZoom(1);
      }
    } catch (err: any) {
      setError('Erro ao acessar câmera. Verifique permissões.');
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    const track = streamRef.current.getVideoTracks()[0];
    const newState = !isTorchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: newState }] as any });
      setIsTorchOn(newState);
    } catch (e) { console.error(e); }
  };

  const captureAndScan = async () => {
    if (isScanning || !videoRef.current || !canvasRef.current) return;
    setIsScanning(true);
    setError(null);

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Preview: imagem colorida em boa qualidade para o usuário ver no modal
    canvas.width = 800;
    canvas.height = Math.round((800 * video.videoHeight) / video.videoWidth);
    const ctx = canvas.getContext('2d');
    if (!ctx) { setIsScanning(false); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const previewBase64 = canvas.toDataURL('image/jpeg', 0.8);
    setLastCapturedImage(previewBase64);

    // IA: 512x512 grayscale + contraste aumentado
    // Resultado: ~60% menos tokens → ~60% menos custo por scan
    // IA: Frame colorido para melhor nitidez em etiquetas com cores (preços vermelhos/laranja)
    const aiCanvas = document.createElement('canvas');
    aiCanvas.width = 640; // Aumentado de 512 para 640 para melhor leitura
    aiCanvas.height = 640;
    const aiCtx = aiCanvas.getContext('2d');
    if (!aiCtx) { setIsScanning(false); return; }
    
    // Filtro mais leve: apenas ajuste de brilho/contraste, sem remover cor
    aiCtx.filter = 'contrast(1.2) brightness(1.1)';
    aiCtx.drawImage(video, 0, 0, 640, 640);
    const aiBase64 = aiCanvas.toDataURL('image/jpeg', 0.9);

    try {
      const result = await scanPriceTag(aiBase64);
      setIsCameraOpen(false);
      setQuantity(1);
      
      if (result && result.name) {
        setScannedProduct(result);
        showAdIfReady(); // Incrementa contador e mostra anúncio se necessário
      } else {
        const debugInfo = result.debug || result.error || 'Erro desconhecido';
        console.warn("[SCAN] Falha parcial:", debugInfo);
        
        let msg = "Não foi possível ler a etiqueta.";
        if (debugInfo.includes("404")) msg = "Serviço de IA instável. Tente novamente em instantes.";
        if (debugInfo.includes("JSON_VAZIO")) msg = "Imagem pouco nítida. Aproxime mais e foque bem.";
        
        setError(msg);
        setMessage({ type: 'error', text: `${msg}\nDica: Evite reflexos e garanta boa luz.` });
        setScannedProduct({ name: '', price: 0 });
        setTimeout(() => setMessage(null), 10000);
      }
    } catch (e: any) {
      console.error("Erro no processamento:", e);
      const msg = `Falha de rede ou API: ${e.message || 'Erro inesperado'}`;
      setError(msg);
      setMessage({ type: 'error', text: msg });
      setScannedProduct({ name: '', price: 0 });
      setTimeout(() => setMessage(null), 8000);
    } finally {
      setIsScanning(false);
    }
  };

  // --- SINCRONISMO REMOVIDO (SQL direto) ---
  useEffect(() => {
    if (pendingItems.length > 0) {
      // No SQL, itens são salvos direto, não há pendência
      setPendingItems([]);
    }
  }, [pendingItems.length]);

  const trackAbandonment = async (product: any) => {
    if (!product || !product.name) return;
    const abandonmentPayload = {
      name: product.name,
      price: product.price,
      quantity: 1,
      store_name: storeName,
      user_id: getUserId(),
      is_session: true,
      is_abandoned: true,
      shelf_category: inferCategory(product.name)
    };
    await insertItem(abandonmentPayload);
    console.log("[B2B] Abandono registrado para:", product.name);
  };

  const addToCart = async () => {
    if (!scannedProduct) return;
    try {
      const unitWeight = scannedProduct.estimatedWeightG || 100;
      const finalPrice = scannedProduct.isWeightBased 
        ? (scannedProduct.price * (quantity * unitWeight / 1000))
        : scannedProduct.price;
      if (finalPrice <= 0) {
        setMessage({ type: 'error', text: 'Preço inválido (R$ 0,00). Por favor, digite o preço da etiqueta.' });
        return;
      }
      const finalQuantity = scannedProduct.isWeightBased ? 1 : quantity;
      const pName = scannedProduct.name.trim() || 'Produto';
      const displayName = scannedProduct.isWeightBased 
        ? `${pName} (~${((quantity * unitWeight) / 1000).toFixed(3)}kg)`
        : pName;
      const itemPayload = {
        name: displayName,
        price: finalPrice,
        quantity: finalQuantity,
        raw_text: scannedProduct.rawText || '',
        store_name: storeName,
        user_id: getUserId(),
        target_budget: budgetLimit || null,
        is_session: true,
        is_abandoned: false,
        shelf_category: inferCategory(displayName)
      };
      if (scannedProduct.id) {
        await updateItem(scannedProduct.id, { ...itemPayload, is_abandoned: false });
      } else {
        await insertItem(itemPayload);
      }
      setScannedProduct(null);
      setQuantity(1);
      fetchItems();
      setLastCapturedImage(null);
      setMessage({ type: 'success', text: 'Item adicionado!' });
      setTimeout(() => setMessage(null), 2000);
    } catch (err: any) {
      console.error("Erro fatal:", err);
      setMessage({ type: 'error', text: 'Ocorreu um erro inesperado.' });
    }
  };

  const updateQty = async (id: string, delta: number, current: number) => {
    const next = Math.max(1, current + delta);
    setItems(prev => prev.map(item => item.id === id ? { ...item, quantity: next } : item));
    if (id.startsWith('temp-')) {
      setPendingItems(prev => prev.map(item => {
        return item.id === id ? { ...item, quantity: next } : item;
      }));
      return;
    }
    await updateItem(id, { quantity: next });
  };

  const removeItem = async (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
    if (id.startsWith('temp-')) return;
    await deleteItem(id);
  };

  const deleteAccount = async () => {
    const uid = getUserId();
    const confirmed = window.confirm('⚠️ Tem certeza? Todos os seus dados (perfil, compras e histórico) serão PERMANENTEMENTE deletados. Esta ação não pode ser desfeita.');
    if (!confirmed) return;
    setAuthLoading(true);
    try {
      await deleteProfile(uid);
      localStorage.removeItem('xdx_terms_accepted');
      localStorage.removeItem('xdx_user_id');
      setShowProfileModal(false);
      setMessage({ type: 'success', text: 'Conta e dados excluídos com sucesso.' });
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Erro ao excluir conta. Tente novamente.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const finalizePurchase = async () => {
    if (items.length === 0) return;
    if (!window.confirm('Deseja finalizar esta compra e salvar no seu histórico?')) return;
    setAuthLoading(true);
    try {
      const uid = getUserId();
      const tripId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
      });
      await finalizeSession(uid, tripId);
      setItems([]);
      setHasSetStore(false);
      setBudgetLimit(null);
      fetchRecentTrips();
      setMessage({ type: 'success', text: 'Compra finalizada e salva com sucesso!' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Erro ao salvar. Verifique sua rede e tente novamente.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const clearList = async () => {
    if (!window.confirm('Limpar lista atual? (Os itens não serão salvos no histórico)')) return;
    setItems([]);
    setPendingItems([]);
    setHasSetStore(false);
    setBudgetLimit(null);
    const uid = getUserId();
    await deleteSessionItems(uid);
  };

  const total = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  // --- RENDER HELPERS (SQL - sem necessidade de Supabase) ---

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 pb-[calc(8rem+env(safe-area-inset-bottom))]">
      {/* UNIQUE_XDX_12345 TEST */}
      {/* HEADER BASE */}
      <header className="max-w-2xl mx-auto p-4 flex justify-between items-center bg-white shadow-sm border-b border-gray-100 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <XDXLogo className="w-10 h-10" onClick={handleLogoClick} />
          <div>
            <h1 className="text-2xl font-black text-[#003d4d] tracking-tighter italic leading-none">XĐX</h1>
            <p className="text-[9px] font-black text-emerald uppercase tracking-widest">Use e Economize</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && activeTab === 'list' && (
            <button 
              onClick={finalizePurchase} 
              className="bg-emerald text-white px-3 py-2 rounded-xl font-black uppercase text-[10px] shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Finalizar
            </button>
          )}
          <InstallButton variant="header" />
          <button onClick={() => setShowProfileModal(true)} className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-emerald transition-colors"><User className="w-5 h-5" /></button>
          <button onClick={handleLogout} className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-red-500 transition-colors"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      {/* BANNER INSTALAR APP - aparece para quem não tem instalado */}
      <div className="max-w-2xl mx-auto">
        <InstallButton variant="banner" />
      </div>
      
      {/* GAMIFICATION BADGE (LIFETIME SAVINGS) */}
      {lifetimeSavings !== 0 && (
         <div className={`${lifetimeSavings > 0 ? 'bg-emerald border-emerald/20 shadow-[0_4px_10px_rgba(16,185,129,0.3)]' : 'bg-red-50 border-red-200 shadow-[0_4px_10px_rgba(239,68,68,0.1)]'} border-b px-4 py-3 flex items-center justify-center gap-3 relative z-10 transition-all duration-500 mx-auto max-w-2xl sm:rounded-b-3xl`}>
            <span className="text-2xl drop-shadow-md">{lifetimeSavings > 0 ? '💰' : '🚨'}</span>
            <div>
               <p className={`text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1 text-center ${lifetimeSavings > 0 ? 'text-[#003d4d] opacity-90' : 'text-red-800 opacity-80'}`}>
                  {lifetimeSavings > 0 ? 'Você Poupou na Vida' : 'Dívida Vitalícia Acumulada'}
               </p>
               <p className={`text-xl font-black tracking-tighter leading-none drop-shadow-md text-center ${lifetimeSavings > 0 ? 'text-white' : 'text-red-500'}`}>
                  {lifetimeSavings > 0 ? '' : '- '}R$ {Math.abs(lifetimeSavings).toFixed(2)}
               </p>
            </div>
         </div>
      )}
  
      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 left-4 right-4 z-[100] p-4 rounded-2xl shadow-lg border ${
              message.type === 'success' ? 'bg-green-50 border-green-100 text-green-600' : 'bg-red-50 border-red-100 text-red-600'
            }`}
          >
            <div className="flex items-center gap-3">
              {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
              <p className="font-bold text-sm">{message.text}</p>
            </div>
            <button onClick={() => setMessage(null)} className="absolute top-2 right-2 p-1 opacity-20"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
  
      <main className="max-w-2xl mx-auto p-6 space-y-8">
        {/* COMPRA ATIVA */}
        <div className="space-y-4">
          <div className="flex justify-between items-end px-1">
              <h2 className="text-lg font-black uppercase tracking-tighter text-[#003d4d]">Sua Lista</h2>
              {items.length > 0 && <button onClick={clearList} className="text-[10px] font-black text-red-400 uppercase tracking-widest">Limpar Tudo</button>}
            </div>
            
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {items.length === 0 && (
                  <div className="text-center py-10 space-y-6">
                    <div className="opacity-20">
                      <ShoppingCart className="w-32 h-32 mx-auto mb-4" />
                      <p className="font-black uppercase tracking-widest text-sm">Nenhum item detectado</p>
                      <p className="text-xs font-medium mt-2">Toque na câmera para escanear sua primeira etiqueta</p>
                    </div>
                    <div className="opacity-100 pt-4">
                      <InstallButton variant="full" />
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-3">Instale o app e use no supermercado sem precisar do navegador</p>
                    </div>
                  </div>
                )}
                {items.map(item => (
                  <motion.div key={item.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white p-3 rounded-2xl border border-gray-100 flex justify-between items-center group shadow-sm">
                    <div className="flex-1 min-w-0 pr-3">
                      <h3 className="text-sm font-black text-[#1a202c] uppercase">{item.name}</h3>
                      <p className="text-base font-black text-emerald">R$ {item.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                        <button onClick={() => updateQty(item.id, -1, item.quantity)} className="w-8 h-8 bg-white text-emerald rounded-lg font-black shadow-sm">-</button>
                        <span className="font-black text-sm min-w-[1rem] text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1, item.quantity)} className="w-8 h-8 bg-white text-emerald rounded-lg font-black shadow-sm">+</button>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
      </main>

      {/* FIXED FOOTER TOTAL & SCANNER TRIGGER */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white border-t border-gray-200 z-40 max-w-2xl mx-auto shadow-[0_-5px_20px_rgba(0,0,0,0.05)] flex flex-col gap-2">
        
        {/* PLANEJADOR DE METAS (PROGRESS BAR) */}
        {budgetLimit && budgetLimit > 0 && (
           <div className="flex flex-col gap-1.5 w-full pt-1 mb-1">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-gray-400">Meta: R$ {budgetLimit.toFixed(2)}</span>
                <span className={((total / budgetLimit) * 100) >= 90 ? 'text-red-500' : 'text-emerald'}>
                  {((total / budgetLimit) * 100).toFixed(0)}% Gasto
                </span>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${((total / budgetLimit) * 100) >= 90 ? 'bg-red-500' : 'bg-emerald'}`} 
                  style={{ width: `${Math.min(((total / budgetLimit) * 100), 100)}%` }} 
                />
              </div>
           </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
             <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1">Total da Compra</p>
             <p className="text-4xl font-black text-[#003d4d] tracking-tighter italic leading-none whitespace-nowrap overflow-visible">R$ {total.toFixed(2)}</p>
          </div>
          <button onClick={() => {
            if (items.length === 0 && !hasSetStore) {
              setShowStoreModal(true);
            } else {
              setIsCameraOpen(true);
            }
          }} className="w-18 h-18 sm:w-20 sm:h-20 bg-[#003d4d] text-white rounded-[1.8rem] shadow-2xl flex items-center justify-center active:scale-90 transition-all">
            <Camera className="w-8 h-8 sm:w-10 sm:h-10" />
          </button>
        </div>
      </div>

      {/* CAMERA OVERLAY */}
      <AnimatePresence>
        {isCameraOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black flex flex-col">
            <div className="relative flex-1 overflow-hidden">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center p-10 pointer-events-none">
                <div className="w-full max-w-sm aspect-[4/3] border-4 border-emerald rounded-[3rem] relative shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]">
                  <div className="absolute top-1/2 left-0 right-0 h-1 bg-emerald opacity-50 shadow-[0_0_15px_#10b981]" />
                </div>
              </div>
              <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-6">
                <button onClick={captureAndScan} disabled={isScanning} className="w-24 h-24 bg-white rounded-full border-8 border-emerald group active:scale-90 transition-all flex items-center justify-center">
                  {isScanning ? <Loader2 className="w-10 h-10 text-emerald animate-spin" /> : <div className="w-12 h-12 bg-emerald rounded-full group-hover:scale-110 transition-all" />}
                </button>
                <p className="font-black text-white uppercase tracking-widest text-xs drop-shadow-lg">Toque para Capturar</p>
              </div>
              <div className="absolute top-10 right-6 p-4 bg-black/60 text-white rounded-2xl"><X className="w-8 h-8" onClick={() => setIsCameraOpen(false)} /></div>
              {hasTorch && <div className={`absolute top-10 left-6 p-4 rounded-2xl ${isTorchOn ? 'bg-emerald text-white' : 'bg-black/60 text-white'}`}><Zap className="w-8 h-8" onClick={toggleTorch} /></div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SCANNED PRODUCT MODAL */}
      <AnimatePresence>
        {scannedProduct && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/80 flex items-end sm:items-center justify-center">
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 pb-10 shadow-2xl border border-gray-100 space-y-5">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black uppercase tracking-tighter text-[#003d4d]">Confirmar Item</h2>
                <button 
                  onClick={() => {
                    trackAbandonment(scannedProduct);
                    setScannedProduct(null);
                  }}
                  className="p-2"
                >
                  <X className="w-6 h-6 text-gray-300" />
                </button>
              </div>
 
              <div className="flex gap-4">
                {lastCapturedImage && <img src={lastCapturedImage} className="w-24 h-24 object-cover rounded-2xl border shadow-inner" />}
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Identificação</label>
                    <input type="text" value={scannedProduct.name} onChange={e => setScannedProduct({...scannedProduct, name: e.target.value})} className="w-full bg-gray-50 px-4 py-3 rounded-xl font-black text-lg uppercase outline-emerald" />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 block">
                      {scannedProduct.isWeightBased ? 'Preço por QUILO (Kg)' : 'Preço Unitário'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-sm text-gray-400">R$</span>
                      <input 
                        type="number" 
                        step="0.01" 
                        autoFocus={scannedProduct.price === 0}
                        value={scannedProduct.price} 
                        onChange={e => setScannedProduct({...scannedProduct, price: parseFloat(e.target.value) || 0})} 
                        className={`w-full bg-gray-50 px-4 py-3 pl-10 rounded-xl font-black text-xl outline-emerald ${scannedProduct.isWeightBased ? 'border-2 border-emerald/20' : ''}`} 
                      />
                    </div>
                  </div>
                </div>
              </div>
 
              {lastPriceInfo && (
                <div className={`p-3 rounded-xl flex items-center gap-3 border ${scannedProduct.price > lastPriceInfo.price ? 'bg-red-50 border-red-100 text-red-500' : scannedProduct.price < lastPriceInfo.price ? 'bg-green-50 border-green-100 text-green-500' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-black uppercase text-[8px] tracking-widest">{scannedProduct.price > lastPriceInfo.price ? '⚠️ Subiu!' : scannedProduct.price < lastPriceInfo.price ? '✅ Baixou!' : 'Mesmo preço'}</p>
                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${scannedProduct.price > lastPriceInfo.price ? 'bg-red-100' : scannedProduct.price < lastPriceInfo.price ? 'bg-green-100' : 'bg-gray-100'}`}>
                        {scannedProduct.price > lastPriceInfo.price ? '+' : ''} R$ {(scannedProduct.price - lastPriceInfo.price).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs font-bold mt-1">Última compra: R$ {lastPriceInfo.price.toFixed(2)}</p>
                  </div>
                  {scannedProduct.price > lastPriceInfo.price ? <Zap className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                </div>
              )}
 
              <div className="bg-gray-50 p-4 rounded-2xl flex items-center justify-center gap-6">
                <button 
                  onClick={() => setScannedProduct({...scannedProduct, isWeightBased: false})}
                  className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${!scannedProduct.isWeightBased ? 'bg-white text-[#003d4d] shadow-sm' : 'text-gray-400'}`}
                >
                  📦 Unidade
                </button>
                <button 
                  onClick={() => setScannedProduct({...scannedProduct, isWeightBased: true})}
                  className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${scannedProduct.isWeightBased ? 'bg-white text-emerald shadow-sm' : 'text-gray-400'}`}
                >
                  ⚖️ Peso Estimado
                </button>
              </div>

              {scannedProduct.isWeightBased && (
                <div className="p-4 bg-emerald/5 rounded-2xl border border-emerald/10 space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-[8px] font-black text-emerald uppercase tracking-widest">Peso Unitário Médio</p>
                    <div className="flex items-center gap-2">
                       <input 
                        type="number" 
                        value={scannedProduct.estimatedWeightG || 0} 
                        onChange={e => setScannedProduct({...scannedProduct, estimatedWeightG: parseInt(e.target.value) || 0})}
                        className="w-16 bg-white border border-emerald/20 rounded-lg p-1 text-center font-black text-emerald"
                      />
                      <span className="text-[10px] font-black text-emerald">g</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald/60 font-medium leading-tight">Baseado no peso médio de {scannedProduct.name || 'item'} encontrado na internet.</p>
                </div>
              )}
 
              <div className="flex items-center justify-between py-4 border-y border-gray-50">
                <div>
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2">QUANTIDADE (UN)</p>
                  <div className="flex items-center gap-6">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 bg-gray-50 rounded-xl font-black text-xl border">-</button>
                    <span className="text-3xl font-black text-[#003d4d]">{quantity}</span>
                    <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 bg-gray-50 rounded-xl font-black text-xl border">+</button>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    {scannedProduct.isWeightBased && (
                      <span className="bg-emerald text-white text-[8px] font-black px-2 py-0.5 rounded-full animate-bounce">VALOR ESTIMADO</span>
                    )}
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">SUBTOTAL</p>
                  </div>
                  <p className="text-3xl font-black text-emerald italic">
                    R$ {scannedProduct.isWeightBased 
                      ? (scannedProduct.price * (quantity * (scannedProduct.estimatedWeightG || 100) / 1000)).toFixed(2)
                      : (scannedProduct.price * quantity).toFixed(2)
                    }
                  </p>
                  {scannedProduct.isWeightBased && (
                    <p className="text-[10px] font-bold text-gray-400 italic">~ {((quantity * (scannedProduct.estimatedWeightG || 100)) / 1000).toFixed(3)}kg total</p>
                  )}
                </div>
              </div>
 
              <button onClick={addToCart} className="w-full bg-emerald text-white py-5 rounded-2xl font-black uppercase text-base shadow-lg active:scale-[0.98] transition-all">Confirmar e Adicionar</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* STORE NAME MODAL */}
      <AnimatePresence>
        {showStoreModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/80 flex items-end sm:items-center justify-center">
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 pb-10 shadow-2xl border border-gray-100 space-y-5">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black uppercase tracking-tighter text-[#003d4d]">Onde estamos?</h2>
                <button onClick={() => setShowStoreModal(false)} className="p-2"><X className="w-6 h-6 text-gray-300" /></button>
              </div>
              <p className="text-sm font-medium text-gray-500">Informe o estabelecimento e opcionalmente uma meta de gastos para acompanhamento.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Nome do Mercado</label>
                  <input 
                    type="text" 
                    value={storeName === 'Mercado XĐX' ? '' : storeName} 
                    onChange={e => setStoreName(e.target.value)} 
                    placeholder="Ex: Assaí, Carrefour, Atacadão..."
                    autoFocus
                    className="w-full bg-gray-50 px-4 py-4 rounded-2xl font-black text-lg uppercase outline-emerald border border-gray-100 placeholder:text-gray-300 transition-all focus:border-emerald/50" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Meta de Gasto (Opcional)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-sm text-gray-400">R$</span>
                    <input 
                      type="number"
                      step="1"
                      value={budgetLimit || ''} 
                      onChange={e => setBudgetLimit(parseFloat(e.target.value) || null)} 
                      placeholder="Sem limite"
                      className="w-full bg-gray-50 px-4 py-4 pl-10 rounded-2xl font-black text-lg outline-emerald border border-gray-100 placeholder:text-gray-300 transition-all focus:border-emerald/50" 
                    />
                  </div>
                </div>
              </div>
              <button 
                onClick={() => {
                  if (storeName.trim() === '') setStoreName('Mercado XĐX');
                  setHasSetStore(true);
                  setShowStoreModal(false);
                  setIsCameraOpen(true);
                }} 
                className="w-full bg-emerald text-white py-5 rounded-2xl font-black uppercase text-base shadow-lg active:scale-[0.98] transition-all"
              >
                Começar Lista! <Zap className="w-5 h-5 inline ml-2" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TERMS OF USE + LGPD MODAL */}
      <AnimatePresence>
        {showTermsModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-gray-100 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-center mb-2">
                <div className="w-16 h-16 bg-emerald/10 rounded-full flex items-center justify-center text-emerald">
                  <Check className="w-8 h-8" />
                </div>
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-[#003d4d] text-center">Termos de Uso e Privacidade</h2>
              <div className="text-sm text-gray-500 space-y-4 font-medium bg-gray-50 p-5 rounded-2xl border border-gray-100">
                <p>Bem-vindo ao <strong>XĐX Global Shopping</strong>! Ao utilizar este aplicativo, você concorda com os seguintes termos.</p>

                <p className="text-[11px] font-black uppercase tracking-widest text-[#003d4d]">🤖 Inteligência Artificial</p>
                <ul className="list-disc pl-4 space-y-1.5 text-xs">
                  <li>Os preços e nomes de produtos são <strong>estimativas geradas por IA</strong> (Google Gemini e OpenAI). Podem conter erros.</li>
                  <li>As imagens capturadas são enviadas aos servidores do Google e OpenAI <strong>apenas para leitura do preço</strong> e não são armazenadas.</li>
                  <li>O app exime-se de qualquer responsabilidade sobre divergências de valores no caixa.</li>
                </ul>

                <p className="text-[11px] font-black uppercase tracking-widest text-[#003d4d]">🔒 Privacidade e LGPD</p>
                <ul className="list-disc pl-4 space-y-1.5 text-xs">
                  <li>Coletamos: nome, telefone e histórico de compras para personalizar sua experiência.</li>
                  <li>Seus dados são armazenados com segurança em SQL local e <strong>nunca vendidos a terceiros</strong>.</li>
                  <li>Você pode <strong>excluir sua conta e todos os seus dados</strong> a qualquer momento no menu do seu perfil.</li>
                  <li>Em conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong>.</li>
                  <li>Dúvidas: <strong>privacidade@xdxglobal.com</strong></li>
                </ul>

                <p className="text-[11px] font-black uppercase tracking-widest text-[#003d4d]">📋 Responsabilidades</p>
                <ul className="list-disc pl-4 space-y-1.5 text-xs">
                  <li>É sua responsabilidade conferir os valores reais nos produtos antes do pagamento.</li>
                  <li>O aplicativo é uma ferramenta de auxílio e não substitui a conferência manual.</li>
                </ul>
              </div>
              <button 
                onClick={() => {
                  localStorage.setItem('xdx_terms_accepted', 'true');
                  setShowTermsModal(false);
                }} 
                className="w-full bg-[#003d4d] text-white py-4 rounded-2xl font-black uppercase text-[12px] tracking-widest shadow-xl active:scale-[0.98] transition-all"
              >
                Li e Concordo com os Termos e Política de Privacidade
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* USER PROFILE MODAL */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 pb-10 shadow-2xl border border-gray-100 space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black uppercase tracking-tighter text-[#003d4d]">Menu do Usuário</h2>
                <button onClick={() => setShowProfileModal(false)} className="p-2"><X className="w-6 h-6 text-gray-300" /></button>
              </div>

              <form onSubmit={saveOnboarding} className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-emerald">Meus Dados</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Nome</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required className="w-full bg-gray-50 px-3 py-3 rounded-xl font-bold text-sm outline-emerald border border-gray-100" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Sobrenome</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full bg-gray-50 px-3 py-3 rounded-xl font-bold text-sm outline-emerald border border-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Telefone (C/ DDD)</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" className="w-full bg-gray-50 px-3 py-3 rounded-xl font-bold text-sm outline-emerald border border-gray-100" />
                </div>
                <button type="submit" disabled={authLoading} className="w-full bg-[#003d4d] text-white py-3 rounded-xl font-black uppercase text-xs shadow-md active:scale-95 transition-all">
                  {authLoading ? 'Salvando...' : 'Salvar Dados'}
                </button>
              </form>

              <div className="pt-4 border-t border-gray-100 space-y-4">
                 <h3 className="text-xs font-black uppercase tracking-widest text-emerald">Últimas Compras</h3>
                 {recentTrips.length === 0 ? (
                    <p className="text-sm font-medium text-gray-400 text-center py-4">Nenhuma compra finalizada ainda.</p>
                 ) : (
                    <div className="space-y-3">
                      {recentTrips.map(trip => (
                        <div key={trip.id} className="bg-emerald/5 p-4 rounded-2xl border border-emerald/10 flex justify-between items-center">
                          <div>
                            <p className="font-black text-[#003d4d] uppercase text-sm">{trip.store}</p>
                            <p className="text-[10px] font-bold text-gray-500">{trip.date} • {trip.count} itens</p>
                            {trip.saved > 0 ? (
                               <p className="text-[10px] font-black tracking-widest uppercase text-emerald mt-1 bg-emerald/10 inline-block px-1.5 py-0.5 rounded-md">Poupou: R$ {trip.saved.toFixed(2)}</p>
                            ) : trip.saved < 0 ? (
                               <p className="text-[10px] font-black tracking-widest uppercase text-red-500 mt-1 bg-red-50 inline-block px-1.5 py-0.5 rounded-md">Passou: - R$ {Math.abs(trip.saved).toFixed(2)}</p>
                            ) : null}
                          </div>
                          <p className="text-lg font-black text-[#003d4d] drop-shadow-sm">R$ {trip.total.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                 )}
              </div>

              {/* LGPD — DIREITO À EXCLUSÃO */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">🔒 Privacidade (LGPD)</p>
                <button
                  onClick={deleteAccount}
                  disabled={authLoading}
                  className="w-full border border-red-200 text-red-500 bg-red-50 py-3 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-[0.98] transition-all hover:bg-red-100"
                >
                  {authLoading ? 'Excluindo...' : '🗑️ Excluir Minha Conta e Todos os Dados'}
                </button>
                <p className="text-[9px] text-gray-400 text-center mt-2">Em conformidade com a LGPD — Lei nº 13.709/2018</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="hidden" />
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsScanning(true);
        const reader = new FileReader();
        reader.onload = async () => {
          const result = await scanPriceTag(reader.result as string);
          if (result) setScannedProduct(result);
          setIsScanning(false);
        };
        reader.readAsDataURL(file);
      }} />
    </div>
  );
}

