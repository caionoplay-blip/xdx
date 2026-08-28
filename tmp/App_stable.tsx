/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useState, useRef, useEffect } from 'react';
import { Camera, Plus, Trash2, ShoppingCart, Loader2, X, Check, Image as ImageIcon, Zap, ZapOff, Calculator, LogOut, BarChart3, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { scanPriceTag, ProductInfo } from './services/gemini';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
// @ts-ignore
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
// @ts-ignore
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
// Safely init to avoid hard crash when env vars are missing
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const XDXLogo = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg viewBox="0 0 100 115" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feFlood floodColor="#4ade80" floodOpacity="0.5" result="glowColor" />
        <feComposite in="glowColor" in2="blur" operator="in" result="softGlow" />
        <feMerge>
          <feMergeNode in="softGlow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#004d61" />
        <stop offset="100%" stopColor="#002d3a" />
      </linearGradient>
      <filter id="buttonShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3" />
      </filter>
    </defs>
    <rect x="8" y="5" width="84" height="105" rx="20" fill="url(#bodyGrad)" stroke="#10b981" strokeWidth="1.5" />
    <g filter="url(#neonGlow)">
      <rect x="18" y="15" width="64" height="32" rx="8" fill="#bbf7d0" />
      <text x="50" y="38" fontSize="20" fontWeight="900" fill="#003d4d" textAnchor="middle" fontFamily="sans-serif">XĐX</text>
    </g>
    <g transform="translate(18, 54)" filter="url(#buttonShadow)">
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
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [storeName, setStoreName] = useState<string>('Mercado XĐX');
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [lastPriceInfo, setLastPriceInfo] = useState<{ price: number; store: string } | null>(null);

  // --- AUTH STATE ---
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset' | 'reset-password'>('login');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // --- REFS ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!supabase) {
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setItems([]);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        if (event === 'PASSWORD_RECOVERY') {
          setAuthMode('reset-password');
        }
      } else {
        setProfile(null);
        setItems([]);
      }
    });

    // Forced accessibility styles
    const style = document.createElement('style');
    style.innerHTML = `
      :root, html, body { background-color: #ffffff !important; color: #1a202c !important; color-scheme: light !important; }
      * { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif !important; }
    `;
    document.head.appendChild(style);

    return () => {
      subscription.unsubscribe();
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    // Retry fetching profile if missing (helps with anonymous race conditions)
    let intervalId: any;
    if (session && !profile && !authLoading) {
      let retries = 0;
      intervalId = setInterval(async () => {
        if (retries >= 3) {
          clearInterval(intervalId);
          // Auto-create profile if trigger fails
          const { error } = await supabase.from('profiles').upsert({
            id: session.user.id,
            email: session.user.email,
            role: 'customer'
          });
          if (!error) fetchProfile(session.user.id);
          return;
        }
        fetchProfile(session.user.id);
        retries++;
      }, 1000);
    }
    return () => clearInterval(intervalId);
  }, [session, profile, authLoading]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
  };

  const fetchItems = async () => {
    if (!session) return;
    const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false });
    if (data) {
      setItems(data.map(i => ({ ...i, rawText: i.raw_text })));
    }
  };

  useEffect(() => {
    if (session) fetchItems();
  }, [session]);

  const checkLastPrice = async (name: string) => {
    if (!session || !name) return;
    const { data } = await supabase.from('items').select('price, store_name').eq('name', name).order('created_at', { ascending: false }).limit(1);
    if (data && data.length > 0) setLastPriceInfo({ price: data[0].price, store: data[0].store_name });
    else setLastPriceInfo(null);
  };

  useEffect(() => {
    if (scannedProduct?.name) checkLastPrice(scannedProduct.name);
  }, [scannedProduct]);

  const handleAnonymousLogin = async () => {
    setAuthLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: authEmail, // Usando o campo temp de input
        phone: authPassword,
        city: newPassword
      }).eq('id', session.user.id);
      if (error) throw error;
      fetchProfile(session.user.id);
      setMessage({ type: 'success', text: 'Perfil atualizado!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode !== 'reset' && authPassword.length < 6) {
      setMessage({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    
    setAuthLoading(true);
    setMessage(null);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
      } else if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ 
          email: authEmail, 
          password: authPassword,
          options: {
            data: { email: authEmail } // Salva no metadado para o trigger se puder
          }
        });
        if (error) throw error;
        
        if (data.session) {
          setMessage({ type: 'success', text: 'Bem-vindo! Entrando...' });
        } else {
          setMessage({ type: 'success', text: 'Conta criada! Verifique seu e-mail ou tente entrar.' });
          setAuthMode('login');
        }
      } else if (authMode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
          redirectTo: window.location.origin
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'E-mail de recuperação enviado!' });
        setAuthMode('login');
      } else if (authMode === 'reset-password') {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Senha atualizada com sucesso!' });
        setAuthMode('login');
      }
    } catch (err: any) {
      let msg = err.message;
      if (msg === 'Email not confirmed') msg = 'E-mail não confirmado. Verifique sua caixa de entrada ou desative a verificação no Supabase.';
      if (msg === 'User already registered') msg = 'Este e-mail já está cadastrado. Tente fazer login.';
      if (msg === 'Invalid login credentials') msg = 'E-mail ou senha incorretos.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    
    // Configura canvas para alta resolução capturando do feed da câmera
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Qualidade 0.9 para garantir nitidez para OCR
    const image = canvas.toDataURL('image/jpeg', 0.9);
    setLastCapturedImage(image);
    
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      const result = await res.json();
      setIsCameraOpen(false);
      setQuantity(1);
      if (result && !result.error) {
        // Garantia extra no frontend para conversão de número
        if (typeof result.price === 'string') {
          result.price = parseFloat(result.price.replace(',', '.')) || 0;
        }
        setScannedProduct(result);
      } else {
        setError(result?.error || result?.details || 'A IA não conseguiu ler os dados. Verifique a iluminação.');
        setScannedProduct({ name: '', price: 0 });
      }
    } catch (e: any) {
      setError(e.message || 'Erro no processamento');
      setScannedProduct({ name: '', price: 0 });
    } finally {
      setIsScanning(false);
    }
  };

  // --- ITEM HANDLERS ---
  const addToCart = async () => {
    if (!scannedProduct || !session) return;
    const { error } = await supabase.from('items').insert([{
      name: scannedProduct.name,
      price: scannedProduct.price,
      quantity: quantity,
      raw_text: scannedProduct.rawText,
      store_name: storeName
    }]);
    if (!error) {
      fetchItems();
      setScannedProduct(null);
      setLastCapturedImage(null);
    } else setError('Erro ao salvar item.');
  };

  const updateQty = async (id: string, delta: number, current: number) => {
    const next = Math.max(1, current + delta);
    const { error } = await supabase.from('items').update({ quantity: next }).eq('id', id);
    if (!error) fetchItems();
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (!error) fetchItems();
  };

  const clearList = async () => {
    if (!window.confirm('Limpar lista?')) return;
    const { error } = await supabase.from('items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (!error) setItems([]);
  };

  const finishTrip = async () => {
    if (!items.length) return;
    const total = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
    const { error } = await supabase.from('shopping_trips').insert([{
      total,
      store_name: items[0].store_name || 'Desconhecido',
      items: items
    }]);
    if (!error) {
      await supabase.from('items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setItems([]);
      setActiveTab('dashboard');
    }
  };

  const total = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  // --- RENDER HELPERS ---
  if (!supabase) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md space-y-8 p-10 bg-red-50 rounded-[3rem] border-2 border-red-100 shadow-xl">
        <XDXLogo className="w-24 h-24 mx-auto mb-4 opacity-50 grayscale" />
        <h2 className="text-3xl font-black text-red-600 uppercase italic tracking-tighter">Erro de Configuração</h2>
        <div className="space-y-4 text-left">
          <p className="text-gray-600 font-bold text-sm">O aplicativo não conseguiu carregar as chaves do Supabase.</p>
        </div>
      </div>
    </div>
  );

  if (!session) return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
      <div className="w-full max-w-md text-center">
        <XDXLogo className="w-32 h-32 mx-auto mb-6" />
        <h1 className="text-6xl font-black text-[#003d4d] italic tracking-tighter uppercase mb-8">XĐX</h1>
        <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl space-y-8">
          <h2 className="text-3xl font-black text-[#003d4d] uppercase">Pronto para começar?</h2>
          <button onClick={handleAnonymousLogin} disabled={authLoading} className="w-full bg-emerald text-white py-10 rounded-3xl font-black uppercase text-3xl shadow-xl active:scale-95 transition-all">
            {authLoading ? <Loader2 className="w-10 h-10 animate-spin mx-auto" /> : "ACESSAR AGORA"}
          </button>
        </div>
      </div>
    </div>
  );

  if (session && profile && !profile.full_name) return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-2xl border-t-8 border-emerald space-y-8">
        <h2 className="text-3xl font-black text-[#003d4d] uppercase text-center">Seja Bem-vindo!</h2>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <input type="text" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="SEU NOME" className="w-full bg-gray-50 p-6 rounded-2xl font-black text-xl outline-none" />
          <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="SUA CIDADE" className="w-full bg-gray-50 p-6 rounded-2xl font-black text-xl outline-none" />
          <input type="text" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="TELEFONE" className="w-full bg-gray-50 p-6 rounded-2xl font-black text-xl outline-none" />
          <button type="submit" className="w-full bg-emerald text-white py-6 rounded-2xl font-black uppercase text-xl">Salvar e Entrar</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 pb-40">
      <header className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-gray-100 p-4 pt-[calc(1rem+env(safe-area-inset-top))] flex justify-between items-center z-40">
        <div className="flex items-center gap-3">
          <XDXLogo className="w-10 h-10" />
          <div>
            <h1 className="text-2xl font-black text-[#003d4d] tracking-tighter italic leading-none">XĐX</h1>
            <p className="text-[8px] font-black text-emerald uppercase tracking-widest">Global Shopping v8</p>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 bg-gray-50 rounded-xl text-gray-300 hover:text-red-500"><LogOut className="w-5 h-5" /></button>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex gap-2 p-1.5 bg-gray-100 rounded-2xl">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'list' ? 'bg-white text-emerald shadow-sm' : 'text-gray-400'}`}>Calculadora</button>
          <button onClick={() => { setActiveTab('dashboard'); supabase.from('shopping_trips').select('*').order('created_at', {ascending: false}).then(({data}) => data && setAnalytics(data)); }} className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'dashboard' ? 'bg-white text-emerald shadow-sm' : 'text-gray-400'}`}>Histórico</button>
        </div>

        {activeTab === 'list' ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-xl font-black uppercase tracking-tighter text-[#003d4d]">Carrinho Atual</h2>
            </div>
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {items.map(item => (
                  <motion.div key={item.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: 20 }}
                    className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 flex justify-between items-center">
                    <div className="flex-1 min-w-0 pr-4">
                      <h3 className="text-lg font-black text-[#1a202c] uppercase truncate">{item.name}</h3>
                      <p className="text-xl font-black text-emerald">R$ {item.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-3 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                        <button onClick={() => updateQty(item.id, -1, item.quantity)} className="w-8 h-8 bg-white text-[#003d4d] rounded-lg font-black text-lg shadow-sm">-</button>
                        <span className="font-black text-lg min-w-[1rem] text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1, item.quantity)} className="w-8 h-8 bg-white text-[#003d4d] rounded-lg font-black text-lg shadow-sm">+</button>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="p-2 text-gray-200 hover:text-red-300 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-tighter text-[#003d4d]">Minhas Compras</h2>
            <div className="space-y-3">
              {analytics.map(trip => (
                <div key={trip.id} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{new Date(trip.created_at).toLocaleDateString('pt-BR')}</p>
                    <p className="text-lg font-black text-[#003d4d]">{trip.store_name}</p>
                  </div>
                  <p className="text-xl font-black text-emerald">R$ {trip.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] bg-white/90 backdrop-blur-2xl border-t border-gray-100 z-40 max-w-2xl mx-auto rounded-t-[3rem] shadow-2xl">
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">TOTAL DA COMPRA</p>
            <p className="text-5xl font-black text-emerald tracking-tighter truncate italic leading-none">R$ {total.toFixed(2)}</p>
            {items.length > 0 && <button onClick={finishTrip} disabled={authLoading} className="text-[10px] font-black text-gray-300 uppercase underline mt-2 tracking-widest">Finalizar Compra</button>}
          </div>
          <button onClick={() => setIsCameraOpen(true)} className="w-24 h-24 bg-emerald text-white rounded-[2rem] shadow-[0_15px_40px_rgba(16,185,129,0.3)] flex items-center justify-center active:scale-95 transition-all">
            <Camera className="w-10 h-10" />
          </button>
        </div>
      </div>

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
              <button onClick={() => setIsCameraOpen(false)} className="absolute top-10 right-6 p-4 bg-black/20 text-white rounded-2xl backdrop-blur-md"><X className="w-8 h-8" /></button>
              {hasTorch && <button onClick={toggleTorch} className={`absolute top-10 left-6 p-4 rounded-2xl backdrop-blur-md ${isTorchOn ? 'bg-emerald text-white' : 'bg-black/20 text-white'}`}><Zap className="w-8 h-8" /></button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scannedProduct && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-white/95 backdrop-blur-2xl flex items-end sm:items-center justify-center p-6">
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl border border-gray-100 space-y-8 overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-start">
                <h2 className="text-3xl font-black uppercase tracking-tighter text-[#003d4d]">Confirmar Item</h2>
                <button onClick={() => setScannedProduct(null)} className="p-2"><X className="w-8 h-8 text-gray-300" /></button>
              </div>

              {lastCapturedImage && <img src={lastCapturedImage} className="w-full aspect-video object-cover rounded-3xl border shadow-inner" />}

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Identificação</label>
                  <input type="text" value={scannedProduct.name} onChange={e => setScannedProduct({...scannedProduct, name: e.target.value})} className="w-full bg-gray-50 p-6 rounded-2xl font-black text-2xl uppercase outline-emerald" />
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Preço Unitário</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-2xl text-gray-400">R$</span>
                    <input type="number" step="0.01" value={scannedProduct.price} onChange={e => setScannedProduct({...scannedProduct, price: parseFloat(e.target.value) || 0})} className="w-full bg-gray-50 p-6 pl-16 rounded-2xl font-black text-4xl outline-emerald" />
                  </div>
                  
                  {lastPriceInfo && (
                    <div className={`p-4 rounded-2xl flex items-center gap-3 border ${scannedProduct.price > lastPriceInfo.price ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
                      <div className="flex-1">
                        <p className="font-black uppercase text-[10px] tracking-widest">{scannedProduct.price > lastPriceInfo.price ? '⚠️ Preço Subiu!' : '✅ Preço Baixou!'}</p>
                        <p className="text-sm font-bold">Última compra: R$ {lastPriceInfo.price.toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-gray-100 flex items-center justify-center gap-10">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-16 h-16 bg-gray-50 rounded-2xl font-black text-4xl">-</button>
                  <span className="text-6xl font-black text-[#003d4d]">{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)} className="w-16 h-16 bg-gray-50 rounded-2xl font-black text-4xl">+</button>
                </div>

                <div className="pt-8 flex flex-col gap-4">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SUBTOTAL DO ITEM</p>
                    <p className="text-4xl font-black text-[#003d4d]">R$ {(scannedProduct.price * quantity).toFixed(2)}</p>
                  </div>
                  <button onClick={addToCart} className="w-full bg-emerald text-white py-6 rounded-3xl font-black uppercase text-xl shadow-xl active:scale-95 transition-all">Confirmar e Adicionar</button>
                </div>
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
          const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: reader.result }),
          });
          const result = await res.json();
          if (result) setScannedProduct(result);
          setIsScanning(false);
        };
        reader.readAsDataURL(file);
      }} />
    </div>
  );
}
