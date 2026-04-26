import { useLocation } from "wouter";
import { ScreenImage } from "@/components/screen-image";
import img from "@/assets/screen-auth.png";

export default function Register() {
  const [, setLocation] = useLocation();
  return (
    <div onClick={() => setLocation("/dashboard")} className="cursor-pointer">
      <ScreenImage src={img} alt="Inscription" />
    </div>
  );
}
