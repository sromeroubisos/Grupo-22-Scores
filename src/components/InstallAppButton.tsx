'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import styles from './InstallAppButton.module.css';

type InstallPromptChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<InstallPromptChoice>;
  prompt(): Promise<void>;
}

type InstallPromptMode = 'native' | 'ios-help' | 'android-help';

const INSTALL_PROMPT_DISMISSED_KEY = 'g22-install-prompt-dismissed';

function isAppInstalledDisplayMode() {
  if (typeof window === 'undefined') return false;

  const appleNavigator = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || appleNavigator.standalone === true;
}

function isIosDevice() {
  if (typeof window === 'undefined') return false;

  const { userAgent, platform, maxTouchPoints } = window.navigator;
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

function isAndroidDevice() {
  if (typeof window === 'undefined') return false;

  return /android/i.test(window.navigator.userAgent);
}

function readInstallPromptDismissed() {
  try {
    return window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeInstallPromptDismissed() {
  try {
    window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true');
  } catch {
    // Ignore storage failures in private browsing.
  }
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<InstallPromptMode | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const dismiss = useCallback(() => {
    writeInstallPromptDismissed();
    setShowGuide(false);
    setIsVisible(false);
    setInstallPrompt(null);
    installPromptRef.current = null;
  }, []);

  useEffect(() => {
    if (isAppInstalledDisplayMode() || readInstallPromptDismissed()) {
      return;
    }

    const canRegisterServiceWorker = 'serviceWorker' in navigator && (
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );

    if (canRegisterServiceWorker) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.warn('G22 PWA service worker registration failed:', error);
      });
    }

    const ios = isIosDevice();
    const android = isAndroidDevice();

    const iosHelpTimer = ios
      ? window.setTimeout(() => {
        setMode('ios-help');
        setIsVisible(true);
      }, 0)
      : undefined;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      installPromptRef.current = promptEvent;
      setInstallPrompt(promptEvent);
      setMode('native');
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      dismiss();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const androidFallbackTimer = window.setTimeout(() => {
      if (android && !ios && !isAppInstalledDisplayMode() && !readInstallPromptDismissed()) {
        setMode((currentMode) => currentMode ?? 'android-help');
        setIsVisible((currentVisible) => currentVisible || !installPromptRef.current);
      }
    }, 1500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.clearTimeout(androidFallbackTimer);
      if (iosHelpTimer) {
        window.clearTimeout(iosHelpTimer);
      }
    };
  }, [dismiss]);

  const handleInstall = async () => {
    const promptEvent = installPrompt ?? installPromptRef.current;

    if (mode === 'native' && promptEvent) {
      promptEvent.prompt();
      await promptEvent.userChoice.catch(() => ({ outcome: 'dismissed' as const, platform: '' }));
      dismiss();
      return;
    }

    setShowGuide(true);
  };

  if (!isVisible || !mode) {
    return null;
  }

  const isIos = mode === 'ios-help';
  const isNative = mode === 'native';

  return (
    <>
      <div className={styles.installAppSlot}>
        <button
          type="button"
          className={styles.installAppButton}
          onClick={handleInstall}
          aria-label="Instalar G22 Scores en este dispositivo"
        >
          <span className={styles.installAppIcon}>
            <Download size={18} />
          </span>
          <span className={styles.installAppText}>
            <span>Instalar G22 Scores</span>
            <small>{isNative ? 'Agregar como app' : 'Acceso directo al telefono'}</small>
          </span>
        </button>
        <button
          type="button"
          className={styles.installAppDismiss}
          onClick={dismiss}
          aria-label="Ocultar instalacion de G22 Scores"
        >
          <X size={16} />
        </button>
      </div>

      {showGuide && (
        <div className={styles.installGuideOverlay} role="dialog" aria-modal="true" aria-label="Como instalar G22 Scores">
          <div className={styles.installGuideCard}>
            <button
              type="button"
              className={styles.installGuideClose}
              onClick={dismiss}
              aria-label="Cerrar guia de instalacion"
            >
              <X size={18} />
            </button>
            <div className={styles.installGuideIcon}>
              <Share2 size={20} />
            </div>
            <h2>Agrega G22 Scores a tu pantalla de inicio</h2>
            <p>
              {isIos
                ? 'En iPhone, Apple pide hacerlo manualmente desde Safari.'
                : 'Si no aparece el aviso automatico, podes instalarlo desde el menu del navegador.'}
            </p>
            <div className={styles.installGuideSteps}>
              {isIos ? (
                <>
                  <span>1. Abri G22 Scores en Safari.</span>
                  <span>2. Toca Compartir.</span>
                  <span>3. Elegi Agregar a pantalla de inicio.</span>
                  <span>4. Confirma con Agregar.</span>
                </>
              ) : (
                <>
                  <span>1. Toca el menu de Chrome.</span>
                  <span>2. Elegi Instalar app o Agregar a pantalla principal.</span>
                  <span>3. Confirma la instalacion.</span>
                </>
              )}
            </div>
            <button type="button" className={styles.installGuideDone} onClick={dismiss}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
