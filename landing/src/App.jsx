import { useEffect, useRef, useState } from "react";
import SiteNav from "./sections/SiteNav.jsx";
import Hero from "./sections/Hero.jsx";
import Problem from "./sections/Problem.jsx";
import Modules from "./sections/Modules.jsx";
import WhyNow from "./sections/WhyNow.jsx";
import Weave from "./sections/Weave.jsx";
import Vision from "./sections/Vision.jsx";
import FinalCTA from "./sections/FinalCTA.jsx";
import Footer from "./sections/Footer.jsx";

/**
 * Loom landing — single-page scroll.
 *
 * Each section is a stateless component; this shell wires up:
 *   - scroll-reveal intersection observer (.reveal -> .is-visible)
 *   - sticky-nav scroll state
 *   - smooth anchor scrolling
 */
export default function App() {
  useScrollReveal();

  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Problem />
        <Modules />
        <WhyNow />
        <Weave />
        <Vision />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

function useScrollReveal() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const targets = document.querySelectorAll(".reveal");
    if (reduceMotion) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Tiny helper so sections can share scrollIntoView behavior without
// importing react-router; keeps the bundle lean.
export function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
