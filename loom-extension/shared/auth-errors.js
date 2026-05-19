(function initLoomAuthErrors(root) {
  function errorStatus(error) {
    const status = Number(error?.status || error?.response?.status || 0);
    return Number.isFinite(status) ? status : 0;
  }

  function isNetworkAuthError(error) {
    const status = errorStatus(error);
    if (status === 401 || status === 403) return false;
    if (status === 0 && error && Object.prototype.hasOwnProperty.call(Object(error), "status")) return true;
    const message = String(error?.message || error?.error || error || "").toLowerCase();
    if (!message) return false;
    return [
      "failed to fetch",
      "load failed",
      "networkerror",
      "network error",
      "err_connection_closed",
      "err_connection_reset",
      "err_name_not_resolved",
      "err_internet_disconnected",
      "err_timed_out",
    ].some((needle) => message.includes(needle));
  }

  root.LoomAuthErrors = {
    isNetworkAuthError,
  };
})(globalThis);
