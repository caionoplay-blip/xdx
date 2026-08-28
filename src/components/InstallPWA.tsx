import React, { useEffect, useState } from 'react';
import { Download, Smartphone, Share, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isCapacitor, setIsCapacitor] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true
      || document.referrer.includes('android-app://');
    setIsStandalone(standalone);
    const cap = !!(window as any).Capacitor;
    setIsCapacitor(cap);
    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    setIsIOS(ios);
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return { deferredPrompt, isStandalone, isIOS, isCapacitor, promptInstall };
}

export function InstallButton({ variant = 'header' }: { variant?: 'header' | 'banner' | 'full' }) {
  const { deferredPrompt, isStandalone, isIOS, isCapacitor, promptInstall } = usePWAInstall();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('xdx_pwa_dismissed') === 'true'; } catch { return false; }
  });

  if (isCapacitor || isStandalone) return null;
  if (dismissed && variant === 'banner') return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      const ok = await promptInstall();
      if (!ok) {}
    } else if (isIOS) {
      setShowIOSInstructions(true);
    } else {
      setShowIOSInstructions(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('xdx_pwa_dismissed', 'true'); } catch {}
  };

  const canDirectInstall = !!deferredPrompt;
  const showButton = true;
  if (!showButton) return null;

  if (variant === 'header') {
    return (
      <>
        <button
          onClick={handleClick}
          className="bg-[#10b981] text-white px-3 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center gap-1.5 active:scale-95 transition-all hover:bg-[#0eb887]"
          aria-label="Baixar app"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Baixar App</span>
          <span className="sm:hidden">App</span>
        </button>
        <IOSInstructionsModal open={showIOSInstructions} onClose={() => setShowIOSInstructions(false)} isIOS={isIOS} />
      </>
    );
  }

  if (variant === 'full') {
    return (
      <>
        <button
          onClick={handleClick}
          className="w-full bg-[#003d4d] text-white py-4 rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <Smartphone className="w-5 h-5" />
          {canDirectInstall ? 'Instalar App no Celular' : isIOS ? 'Instalar no iPhone' : 'Baixar App'}
          <Download className="w-4 h-4 opacity-70" />
        </button>
        <IOSInstructionsModal open={showIOSInstructions} onClose={() => setShowIOSInstructions(false)} isIOS={isIOS} />
      </>
    );
  }

  return (
    <>
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        className="bg-gradient-to-r from-[#003d4d] to-[#0f766e] text-white px-4 py-3 flex items-center justify-between gap-3 shadow-md"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="font-black text-[#003d4d] text-xs">XĐX</span>
          </div>
          <div className="min-w-0">
            <p className="font-black text-sm leading-none">Baixe o App XĐX</p>
            <p className="text-[11px] opacity-80 truncate">Instale e use como app nativo • 100% grátis</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleClick}
            className="bg-white text-[#003d4d] px-4 py-2 rounded-full font-black uppercase text-[11px] tracking-widest shadow flex items-center gap-1.5 active:scale-95"
          >
            <Download className="w-4 h-4" /> Instalar
          </button>
          <button onClick={handleDismiss} className="p-1 opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
      <IOSInstructionsModal open={showIOSInstructions} onClose={() => setShowIOSInstructions(false)} isIOS={isIOS} />
    </>
  );
}

function IOSInstructionsModal({ open, onClose, isIOS }: { open: boolean; onClose: () => void; isIOS: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-8 shadow-2xl space-y-5"
          >
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 bg-emerald/10 rounded-2xl flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-emerald" />
              </div>
              <button onClick={onClose} className="p-2 -mr-2 text-gray-300"><X className="w-6 h-6" /></button>
            </div>

            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter text-[#003d4d]">
                {isIOS ? 'Instalar no iPhone' : 'Instalar no Android'}
              </h2>
              <p className="text-sm text-gray-500 font-medium mt-1">
                {isIOS ? 'Instale o XĐX como um app de verdade na sua tela de início.' : 'Instale o XĐX para acesso rápido e uso offline.'}
              </p>
            </div>

            {isIOS ? (
              <div className="space-y-3">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex gap-3 items-start">
                  <div className="w-8 h-8 bg-white rounded-xl border flex items-center justify-center flex-shrink-0 text-[#007aff]"><Share className="w-4 h-4" /></div>
                  <div>
                    <p className="font-black text-sm text-[#003d4d]">1. Toque em <span className="text-[#007aff]">Compartilhar</span> <Share className="w-3 h-3 inline" /></p>
                    <p className="text-xs text-gray-500">No Safari, na barra inferior.</p>
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex gap-3 items-start">
                  <div className="w-8 h-8 bg-white rounded-xl border flex items-center justify-center flex-shrink-0">＋</div>
                  <div>
                    <p className="font-black text-sm text-[#003d4d]">2. Toque em “Adicionar à Tela de Início”</p>
                    <p className="text-xs text-gray-500">Role a lista até encontrar a opção.</p>
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex gap-3 items-start">
                  <div className="w-8 h-8 bg-emerald rounded-xl flex items-center justify-center flex-shrink-0 text-white"><Check className="w-4 h-4" /></div>
                  <div>
                    <p className="font-black text-sm text-[#003d4d]">3. Confirme em “Adicionar”</p>
                    <p className="text-xs text-gray-500">O ícone XĐX aparecerá como um app.</p>
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800">
                  <strong>Dica:</strong> Abra este site no <strong>Safari</strong> (não no Chrome do iPhone) para ver a opção.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
                  <p className="font-black text-sm text-[#003d4d] flex items-center gap-2"><span className="w-6 h-6 bg-white rounded-full border flex items-center justify-center text-xs">1</span> Toque em “Instalar” quando o navegador sugerir</p>
                  <p className="text-xs text-gray-500 ml-8">Ou no menu ⋮ do Chrome &gt; “Instalar app” / “Adicionar à tela inicial”</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
                  <p className="font-black text-sm text-[#003d4d] flex items-center gap-2"><span className="w-6 h-6 bg-white rounded-full border flex items-center justify-center text-xs">2</span> Confirme em “Instalar”</p>
                  <p className="text-xs text-gray-500 ml-8">O app XĐX será adicionado à sua gaveta de apps.</p>
                </div>
                <div className="bg-emerald/10 border border-emerald/20 p-3 rounded-xl text-xs text-emerald-800">
                  ✔️ Depois de instalado, abra pelo ícone <strong>XĐX</strong> como qualquer outro app Android.
                </div>
              </div>
            )}

            <button onClick={onClose} className="w-full bg-[#003d4d] text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-[0.98]">
              Entendi
            </button>

            <p className="text-[10px] text-center text-gray-400 font-bold uppercase tracking-widest">Funciona em Android e iPhone • Sem Play Store necessária</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default InstallButton;
