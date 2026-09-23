// Pull-to-refresh for tab-root screens (tracker S1 fallback). Pass `onRefresh` to <Body>
// and add `reloadKey` to the deps of the screen's data-loading effects: a pull re-reads
// the signed-in user (useMe) and re-runs those effects.
import { useCallback, useState } from 'react';
import { useMe } from './useMe';

export function usePullToRefresh() {
  const { refresh } = useMe();
  const [reloadKey, setReloadKey] = useState(0);
  const onRefresh = useCallback(async () => {
    setReloadKey((k) => k + 1);
    await refresh();
  }, [refresh]);
  return { reloadKey, onRefresh };
}
