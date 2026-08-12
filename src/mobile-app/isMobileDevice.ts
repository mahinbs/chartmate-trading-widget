import { useState, useEffect } from 'react';

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      platform: string;
    };
  }
}

/**
 * True only inside the real native app (Capacitor). This gates native-only
 * UI — the intro splash carousel, the bottom nav bar, and mobile post-login
 * routing — so none of it leaks onto the mobile *web* browser.
 *
 * NOTE: intentionally NOT viewport-width based. A narrow browser window is
 * still the web, not the app; keying off innerWidth made the app-only splash
 * appear for every phone-sized web visitor.
 */
export function useIsMobileApp() {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    setIsMobile(!!window.Capacitor?.isNativePlatform?.());
  }, []);

  return isMobile;
}
