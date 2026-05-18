import { useEffect } from "react";
import SiteNav from "./sections/SiteNav.jsx";
import Hero from "./sections/Hero.jsx";
import Problem from "./sections/Problem.jsx";
import Modules from "./sections/Modules.jsx";
import Pipeline from "./sections/Pipeline.jsx";
import Vision from "./sections/Vision.jsx";
import Milestones from "./sections/Milestones.jsx";
import FinalCTA from "./sections/FinalCTA.jsx";
import Footer from "./sections/Footer.jsx";
import ExtensionPage from "./sections/ExtensionPage.jsx";

/**
 * LOOM landing — single-page scroll.
 *
 * Narrative arc: L·O·O·M four-letter story
 *   Hero (brand) → Problem (scenes) → Modules (L·O·O·M stages)
 *   → Pipeline (data flow) → Vision (future) → Status → CTA
 */
export default function App() {
  useScrollReveal();

  const route = getLandingRoute();

  if (route === "extension") {
    return <ExtensionPage />;
  }

  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Problem />
        <Modules />
        <Pipeline />
        <Vision />
        <Milestones />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

function getLandingRoute() {
  if (typeof window === "undefined") return "home";
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/extension") return "extension";
  return "home";
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

export function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
