import React, { useEffect, useRef, useState } from 'react';

/**
 * Lightweight reveal/parallax effect driven by IntersectionObserver.
 * Avoids per-card scroll listeners and state updates on every scroll tick.
 */
const ScrollReveal = ({ children, className = '' }) => {
    const ref = useRef(null);
    const [transform, setTransform] = useState({ scale: 0.98, translateY: 10, opacity: 0.75 });

    useEffect(() => {
        if (!ref.current || typeof window === 'undefined') return;

        const thresholds = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1];
        const observer = new IntersectionObserver(
            ([entry]) => {
                const ratio = Math.max(0, Math.min(1, entry.intersectionRatio || 0));
                const nextScale = 0.98 + ratio * 0.05;
                const nextTranslate = (1 - ratio) * 10;
                const nextOpacity = 0.75 + ratio * 0.25;

                setTransform((prev) => {
                    if (
                        Math.abs(prev.scale - nextScale) < 0.001 &&
                        Math.abs(prev.translateY - nextTranslate) < 0.1 &&
                        Math.abs(prev.opacity - nextOpacity) < 0.01
                    ) {
                        return prev;
                    }
                    return {
                        scale: nextScale,
                        translateY: nextTranslate,
                        opacity: nextOpacity,
                    };
                });
            },
            {
                root: null,
                rootMargin: '0px 0px -10% 0px',
                threshold: thresholds,
            }
        );

        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className={className}
            style={{
                transform: `translateY(${transform.translateY}px) scale(${transform.scale})`,
                opacity: transform.opacity,
                transition: 'transform 0.2s ease-out, opacity 0.2s ease-out',
                willChange: 'transform, opacity'
            }}
        >
            {children}
        </div>
    );
};

export default ScrollReveal;
