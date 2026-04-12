/**
 * Realtime service — decouples Socket.IO publishing from controllers.
 *
 * Controllers import {pushNotification, getActiveUsers} from here instead of
 * reaching back into server.js. server.js registers the concrete implementation
 * at startup (registerRealtime), breaking the circular import.
 */

let impl = {
  pushNotification: () => {},
  getActiveUsers: () => [],
};

export function registerRealtime(implementation) {
  impl = { ...impl, ...implementation };
}

export function pushNotification(userId, payload) {
  return impl.pushNotification(userId, payload);
}

export function getActiveUsers() {
  return impl.getActiveUsers();
}
