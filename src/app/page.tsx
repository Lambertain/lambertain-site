import Cursor from "@/components/Cursor";
import ScrollReveal from "@/components/ScrollReveal";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Services from "@/components/Services";
import Stack from "@/components/Stack";
import Projects from "@/components/Projects";
import Contact from "@/components/Contact";

export default function Home() {
  return (
    <>
      <Cursor />
      <ScrollReveal />
      <Nav />
      <Hero />
      <Marquee />
      <Services />
      <Stack />
      <Projects />
      <Contact />
    </>
  );
}
