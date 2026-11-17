import React, { useEffect, useRef, useState } from "react";
import {
  motion, useInView, useMotionValue, useReducedMotion, useScroll,
  useSpring, useTransform, type HTMLMotionProps,
} from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

// Keep touch scrolling native and enable depth effects only on larger pointer devices.
function useDesktopPointer() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
    const update = () => setEnabled(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return enabled;
}

function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

export function Reveal({ delay = 0, children, ...props }: HTMLMotionProps<"div"> & { delay?: number }) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  return <motion.div
    initial={reduced ? false : { opacity: 0, y: 26 }}
    whileInView={{ opacity: 1, y: 0 }}
    animate={reduced || focused ? { opacity: 1, y: 0 } : undefined}
    viewport={{ once: true, amount: 0.12 }}
    transition={{ duration: reduced ? 0 : 0.65, delay: reduced ? 0 : delay, ease }}
    onFocusCapture={() => setFocused(true)}
    {...props}
  >{children}</motion.div>;
}

export function FloatingBadge({ index, children, ...props }: HTMLMotionProps<"a"> & { index: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const desktop = useDesktopPointer();
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const inView = useInView(ref, { margin: "100px" });
  const active = desktop && !reduced && visible && inView;
  return <motion.a
    ref={ref}
    animate={{ y: active ? [0, index % 2 ? 8 : -8, 0] : 0, rotate: desktop && !reduced ? [-3, 2, -2, 3, -1, 2][index] : 0 }}
    transition={{ y: active ? { duration: 4.8 + index * 0.35, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }, rotate: { duration: 0.3 } }}
    whileHover={reduced ? undefined : { scale: 1.035 }}
    whileTap={reduced ? undefined : { scale: 0.98 }}
    {...props}
  >{children}</motion.a>;
}

export function ParallaxShowcase({ badges, children }: { badges: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const desktop = useDesktopPointer();
  const pageVisible = usePageVisible();
  const inView = useInView(ref, { margin: "100px" });
  const enabled = desktop && !reduced;
  const floating = enabled && pageVisible && inView;
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateX = useSpring(pointerY, { stiffness: 110, damping: 24 });
  const rotateY = useSpring(pointerX, { stiffness: 110, damping: 24 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scrollOffset = useTransform(scrollYProgress, [0, 1], [30, -35]);
  const y = useSpring(scrollOffset, { stiffness: 90, damping: 28 });
  const glowX = useTransform(rotateY, [-7, 7], ["35%", "65%"]);
  const glowY = useTransform(rotateX, [-5, 5], ["65%", "35%"]);
  const reset = () => { pointerX.set(0); pointerY.set(0); };

  useEffect(() => {
    if (!enabled || !pageVisible) { pointerX.set(0); pointerY.set(0); }
  }, [enabled, pageVisible, pointerX, pointerY]);

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.pointerType !== "mouse" || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
    pointerX.set(x * 14);
    pointerY.set(-y * 10);
  };

  return <div id="features" ref={ref} className="hero-showcase" onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset} onFocusCapture={reset}>
    <div className="feature-badges">{badges}</div>
    <motion.div className="phone-depth" style={{ y: enabled ? y : 0 }}>
      <motion.div className="phone-float" animate={{ y: floating ? [0, -9, 0] : 0 }} transition={{ duration: floating ? 6 : 0, repeat: floating ? Infinity : 0, ease: "easeInOut" }}>
        <motion.div className="phone-tilt" style={{ rotateX: enabled ? rotateX : 0, rotateY: enabled ? rotateY : 0, transformPerspective: enabled ? 1400 : 0 }}>
          {children}
          <motion.div className="phone-reflection" aria-hidden="true" style={{ backgroundPositionX: glowX, backgroundPositionY: glowY, opacity: enabled ? 0.32 : 0 }} />
        </motion.div>
      </motion.div>
    </motion.div>
  </div>;
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return <motion.div aria-hidden="true" className="scroll-progress" style={{ scaleX: reduced ? scrollYProgress : scaleX }} />;
}
