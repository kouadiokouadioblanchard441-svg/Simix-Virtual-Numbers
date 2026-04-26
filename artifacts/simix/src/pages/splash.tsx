import { useEffect } from "react";
import { useLocation } from "wouter";
import { ScreenImage } from "@/components/screen-image";
import img from "@/assets/screen-splash.png";

export default function Splash() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const t = setTimeout(() => setLocation("/login"), 2200);
    return () => clearTimeout(t);
  }, [setLocation]);
  return <ScreenImage src={img} alt="Simix" />;
}
