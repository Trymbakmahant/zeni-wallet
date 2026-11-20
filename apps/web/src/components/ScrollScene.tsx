import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import './scroll-scene.css';

type MotionMode = 'full' | 'gentle' | 'off';
const ScrollMotion = createContext<MotionMode>('off');

// One shared preference subscription; touch devices keep small, native-scroll effects.
export function ScrollMotionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<MotionMode>('off');
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = matchMedia('(min-width: 1000px) and (hover: hover) and (pointer: fine)');
    const update = () => setMode(reduced.matches ? 'off' : desktop.matches ? 'full' : 'gentle');
    update();
    reduced.addEventListener('change', update);
    desktop.addEventListener('change', update);
    return () => {
      reduced.removeEventListener('change', update);
      desktop.removeEventListener('change', update);
    };
  }, []);
  return <ScrollMotion.Provider value={mode}>{children}</ScrollMotion.Provider>;
}

/** A stable measurement layer keeps transforms from feeding back into scroll progress. */
export function ScrollScene({ children, name, variant = 'section' }: {
  children: ReactNode;
  name: string;
  variant?: 'hero' | 'section' | 'footer';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useContext(ScrollMotion);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: variant === 'hero' ? ['start start', 'end start']
      : variant === 'footer' ? ['start end', 'end end'] : ['start end', 'end start'],
  });
  const range = variant === 'section' ? [0, .2, .82, 1] : [0, 1];
  const distance = mode === 'full' ? 64 : 18;
  const y = useTransform(scrollYProgress, range,
    variant === 'hero' ? [0, -distance * 1.5]
      : variant === 'footer' ? [distance * .6, 0] : [distance, 0, 0, -distance * .7]);
  const scale = useTransform(scrollYProgress, range,
    variant === 'hero' ? [1, .97] : variant === 'footer' ? [.98, 1] : [.965, 1, 1, .98]);
  const opacity = useTransform(scrollYProgress, range,
    variant === 'hero' ? [1, .65] : variant === 'footer' ? [.5, 1] : [.45, 1, 1, .6]);
  const radius = useTransform(scrollYProgress, range,
    variant === 'hero' ? [0, 36] : variant === 'footer' ? [20, 0] : [36, 0, 0, 24]);

  return <div ref={ref} className={`scroll-scene scroll-scene-${variant}`} data-scroll-scene={name} data-motion={mode}>
    <motion.div className="scroll-scene-surface" style={{
      y: mode === 'off' ? 0 : y,
      scale: mode === 'full' ? scale : 1,
      opacity: mode === 'off' ? 1 : opacity,
      borderRadius: mode === 'full' ? radius : 0,
    }}>{children}</motion.div>
  </div>;
}
