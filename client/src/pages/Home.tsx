import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";

/**
 * SR AI Super App Landing Page
 * Features a modern hero section with SR AI sign-in
 */
export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  const handleSignIn = () => {
    window.location.href = getLoginUrl();
  };

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <img
            src="/manus-storage/Screenshot2026-11-2110.48.42AM_45fd7577.png"
            alt="SR AI logo"
            className="w-10 h-10 rounded-lg object-cover"
          />
          <span className="text-white font-bold text-xl">SR AI</span>
        </div>
        
        {isAuthenticated && user && (
          <div className="flex items-center gap-4">
            <span className="text-gray-300 text-sm">{user.name || user.email}</span>
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="text-white border-gray-600 hover:bg-gray-800"
            >
              Sign Out
            </Button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 md:py-24">
        <div className="text-center max-w-2xl mx-auto">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <img
              src="/manus-storage/Screenshot2026-11-2110.48.42AM_45fd7577.png"
              alt="SR AI logo"
              className="w-28 h-28 rounded-2xl object-cover shadow-2xl"
            />
          </div>

          {/* Title */}
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            SR AI
          </h1>

          {/* Tagline */}
          <p className="text-xl md:text-2xl text-gray-300 mb-6">
            Your AI Super App
          </p>

          {/* Subtitle */}
          <p className="text-lg text-gray-400 mb-12 leading-relaxed">
            Experience the power of AI with our comprehensive suite of tools
          </p>

          {/* Sign In Button */}
          {!isAuthenticated ? (
            <Button
              onClick={handleSignIn}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {loading ? "Loading..." : "Sign in to SR AI"}
            </Button>
          ) : (
            <div className="text-green-400 text-lg font-semibold">
              Welcome, {user?.name || "User"}! 🎉
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-500 text-sm border-t border-gray-800">
        <p>By Suryadev Renjith</p>
      </footer>
    </div>
  );
}
