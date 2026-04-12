import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useFetch — generic async-state hook that replaces the ubiquitous
 * setLoading/try/catch/finally/setError/setData pattern.
 *
 *   const { data, loading, error, refetch } = useFetch(() => api.getThing());
 *
 * @param {Function} fetcher  Async function returning the data.
 * @param {Object} options
 *   - immediate: run on mount (default true)
 *   - initialData: initial value before first load
 *   - deps: additional dependencies; refetches when any changes
 * @returns {{ data, loading, error, refetch, setData }}
 */
export default function useFetch(fetcher, options = {}) {
  const {
    immediate = true,
    initialData = null,
    deps = [],
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  // Cancel stale responses if the component unmounts or refetch is called
  // before the previous call finishes.
  const mounted = useRef(true);
  const reqId = useRef(0);
  useEffect(() => () => { mounted.current = false; }, []);

  const refetch = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mounted.current && myReq === reqId.current) {
        setData(result);
        return result;
      }
    } catch (err) {
      if (mounted.current && myReq === reqId.current) {
        const msg = err?.response?.data?.error || err?.message || "Request failed";
        setError(msg);
      }
      throw err;
    } finally {
      if (mounted.current && myReq === reqId.current) {
        setLoading(false);
      }
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) {
      refetch().catch(() => { /* error already surfaced via state */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch, setData };
}

/**
 * useAsync — fire-and-forget async action wrapper for event handlers.
 *
 *   const save = useAsync((payload) => api.save(payload));
 *   <button onClick={() => save.run(form)} disabled={save.loading}>Save</button>
 */
export function useAsync(action) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const run = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await action(...args);
        return result;
      } catch (err) {
        const msg = err?.response?.data?.error || err?.message || "Action failed";
        if (mounted.current) setError(msg);
        throw err;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [action],
  );

  return { run, loading, error, setError };
}
