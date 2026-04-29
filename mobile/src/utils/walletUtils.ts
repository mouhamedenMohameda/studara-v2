/**
 * walletUtils - Utilitaires pour la gestion des wallets
 * 
 * Fonctions helper pour notifier les changements de balance
 * et maintenir la synchronisation temps réel
 */

import walletNotificationService from '../hooks/useWalletNotifications';

/**
 * Notifier un changement de balance depuis l'app frontend
 * Appelé après les opérations qui déduisent/ajoutent des crédits
 */
export function notifyWalletUpdate(
  featureKey: string,
  changeAmount: number,
  newBalance?: number,
  userId?: string
) {
  walletNotificationService.notifyUpdate({
    featureKey,
    newBalance: newBalance ?? 0,
    changeAmount,
    userId: userId ?? 'current',
    timestamp: new Date()
  });
}

/**
 * Utilité pour notifier après une dépense
 */
export function notifyWalletSpent(featureKey: string, amountSpent: number) {
  notifyWalletUpdate(featureKey, -amountSpent);
}

/**
 * Utilité pour notifier après un rechargement
 */
export function notifyWalletTopUp(featureKey: string, amountAdded: number, newBalance: number) {
  notifyWalletUpdate(featureKey, amountAdded, newBalance);
}