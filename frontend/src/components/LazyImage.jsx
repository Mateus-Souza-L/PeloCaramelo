import { useEffect, useState } from "react";

export default function LazyImage({
  src,
  alt = "",
  className = "",
  fallbackSrc = "/paw.png",
  loading = "lazy",
  decoding = "async",
}) {
  const [current, setCurrent] = useState(src || fallbackSrc);

  useEffect(() => {
    setCurrent(src || fallbackSrc);
  }, [src, fallbackSrc]);

  return (
    <img
      src={current}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={() => setCurrent(fallbackSrc)}
    />
  );
}
