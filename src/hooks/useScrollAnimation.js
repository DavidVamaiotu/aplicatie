import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook for scroll-based animations using Intersection Observer
 * @param {Object} options - IntersectionObserver options
 * @returns {Array} [ref, isVisible] - ref to attach to element, visibility state
 */
export function useScrollAnimation(options = {}) {
    const ref = useRef(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    // Once visible, stop observing (one-time animation)
                    observer.unobserve(element);
                }
            },
            {
                threshold: options.threshold || 0.1,
                rootMargin: options.rootMargin || '0px 0px -50px 0px',
                ...options
            }
        );

        observer.observe(element);

        return () => observer.disconnect();
    }, [options.threshold, options.rootMargin]);

    return [ref, isVisible];
}

/**
 * Custom hook for parallax effect on scroll
 * @param {number} speed - Parallax speed multiplier (default 0.5)
 * @returns {Object} ref and style object with transform
 */
export function useParallax(speed = 0.5) {
    const ref = useRef(null);
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            if (ref.current) {
                const rect = ref.current.getBoundingClientRect();
                const scrollPosition = window.scrollY;
                const elementTop = rect.top + scrollPosition;
                const relativeScroll = scrollPosition - elementTop;
                setOffset(relativeScroll * speed);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [speed]);

    return { ref, style: { transform: `translateY(${offset}px)` } };
}
