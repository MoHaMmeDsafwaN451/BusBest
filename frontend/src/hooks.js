import { useCallback, useEffect, useState } from "react";
import { http } from "./api";

export function useData(path, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }
    let active = true;
    setLoading(true);
    http.get(path)
      .then((value) => { if (active) { setData(value); setError(null); } })
      .catch((reason) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, enabled, revision]);

  return { data, error, loading, reload };
}
