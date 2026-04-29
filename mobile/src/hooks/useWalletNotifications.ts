/**
 * useWalletNotifications - Hook pour notifier les changements de balance
 * 
 * Permet aux composants de s'abonner aux changements de balance
 * et de rafraîchir automatiquement leurs données.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface WalletUpdateEvent {
  featureKey: string;
  newBalance: number;
  changeAmount: number;
  userId: string;
  timestamp: Date;
}

class WalletNotificationService {
  private subscribers: Map<string, ((event: WalletUpdateEvent) => void)[]> = new Map();
  private globalSubscribers: ((event: WalletUpdateEvent) => void)[] = [];

  // S'abonner aux changements d'une feature spécifique
  subscribe(featureKey: string, callback: (event: WalletUpdateEvent) => void): () => void {
    if (!this.subscribers.has(featureKey)) {
      this.subscribers.set(featureKey, []);
    }
    this.subscribers.get(featureKey)!.push(callback);

    // Retourner une fonction de désabonnement
    return () => {
      const callbacks = this.subscribers.get(featureKey);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index >= 0) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  // S'abonner à tous les changements de balance
  subscribeToAll(callback: (event: WalletUpdateEvent) => void): () => void {
    this.globalSubscribers.push(callback);

    return () => {
      const index = this.globalSubscribers.indexOf(callback);
      if (index >= 0) {
        this.globalSubscribers.splice(index, 1);
      }
    };
  }

  // Notifier un changement de balance
  notifyUpdate(event: WalletUpdateEvent) {
    // Notifier les abonnés de la feature spécifique
    const featureSubscribers = this.subscribers.get(event.featureKey);
    if (featureSubscribers) {
      featureSubscribers.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.warn('Erreur dans callback wallet notification:', error);
        }
      });
    }

    // Notifier les abonnés globaux
    this.globalSubscribers.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.warn('Erreur dans callback wallet notification global:', error);
      }
    });
  }
}

// Instance globale du service
const walletNotificationService = new WalletNotificationService();

/**
 * Hook pour s'abonner aux changements de balance d'une feature
 */
export function useWalletNotifications(featureKey?: string) {
  const [lastUpdate, setLastUpdate] = useState<WalletUpdateEvent | null>(null);
  const callbackRef = useRef<((event: WalletUpdateEvent) => void) | null>(null);

  const notifyUpdate = useCallback((event: WalletUpdateEvent) => {
    walletNotificationService.notifyUpdate(event);
  }, []);

  useEffect(() => {
    const callback = (event: WalletUpdateEvent) => {
      setLastUpdate(event);
    };
    callbackRef.current = callback;

    let unsubscribe: (() => void) | null = null;

    if (featureKey) {
      // S'abonner à une feature spécifique
      unsubscribe = walletNotificationService.subscribe(featureKey, callback);
    } else {
      // S'abonner à tous les changements
      unsubscribe = walletNotificationService.subscribeToAll(callback);
    }

    return unsubscribe;
  }, [featureKey]);

  return {
    lastUpdate,
    notifyUpdate
  };
}

export default walletNotificationService;