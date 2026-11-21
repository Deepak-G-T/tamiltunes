import { useEffect, useState } from 'react';
import { getOnlineStatus, subscribeOnlineStatus } from '../lib/networkStatus';

/** true while the device has a connection. Uses the Capacitor Network plugin in the app, the browser's online / offline events elsewhere. */
export function useOnlineStatus() {
  const [online, setOnline] = useState(getOnlineStatus);

  useEffect(() => {
    return subscribeOnlineStatus(setOnline);
  }, []);

  return online;
}
