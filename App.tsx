import React, { useState, useEffect, useRef } from "react";
import { toPng } from "html-to-image";
import {
  Sparkles,
  Upload,
  Share2,
  Camera,
  RefreshCw,
  ArrowRight,
  Download,
  X,
} from "lucide-react";
import { BeautyState, Product, SharedData } from "./types";
import {
  generateFacialReport,
  generateMakeupLook,
  searchProducts,
} from "./services/geminiService";
import Button from "./components/Button";
import ProductCard from "./components/ProductCard";

const App: React.FC = () => {
  const [state, setState] = useState<BeautyState>({
    originalImage: null,
    generatedImage: null,
    diagnosticImage: null,
    products: [],
    isLoading: false,
    error: null,
    lookDescription: null,
    diagnosticSummary: null,
    diagnosticMetrics: [],
  });

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [userRequest, setUserRequest] = useState<string>("");
  const [researchNotes, setResearchNotes] = useState<string>("");
  const [isSavingImage, setIsSavingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const trimmedUserRequest = userRequest.trim();
  const trimmedResearchNotes = researchNotes.trim();
  const canSaveShareCard = Boolean(
    state.diagnosticImage &&
      state.generatedImage &&
      state.lookDescription &&
      state.diagnosticMetrics.length
  );
  const overallMetric = state.diagnosticMetrics.find((metric) =>
    metric.label.toLowerCase().includes("overall")
  );

  // Load state from URL hash on mount if available
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (hash) {
      try {
        const decoded = JSON.parse(
          atob(decodeURIComponent(hash))
        ) as SharedData;
        if (decoded.desc && decoded.prods) {
          setState((prev) => ({
            ...prev,
            products: decoded.prods,
            lookDescription: decoded.desc,
            // We can't easily share the large base64 image via URL without a backend,
            // so we show the results and let user know.
            generatedImage: null, // Or a placeholder if we had one
          }));
        }
      } catch (e) {
        console.warn("Failed to parse shared data", e);
      }
    }
  }, []);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      setIsCameraMode(true);

      // Wait for next tick to ensure video element is rendered
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch((err) => {
            console.error("Video play error:", err);
          });
        }
      }, 100);
    } catch (err) {
      console.error("Camera access error:", err);
      setState((prev) => ({
        ...prev,
        error:
          "Unable to access camera. Please check permissions or use file upload.",
      }));
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraMode(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    // Flip horizontally to match the mirrored preview
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

    setState((prev) => ({
      ...prev,
      originalImage: dataUrl,
      generatedImage: null,
      diagnosticImage: null,
      products: [],
      lookDescription: null,
      diagnosticSummary: null,
      diagnosticMetrics: [],
      error: null,
      isLoading: false,
    }));

    stopCamera();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setState((prev) => ({
        ...prev,
        error: "Image size too large. Please use an image under 5MB.",
      }));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setState((prev) => ({
        ...prev,
        originalImage: base64,
        generatedImage: null,
        diagnosticImage: null,
        products: [],
        lookDescription: null,
        diagnosticSummary: null,
        diagnosticMetrics: [],
        error: null,
        isLoading: false,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleProcess = async () => {
    if (!state.originalImage) return;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      generatedImage: null,
      products: [],
      lookDescription: null,
    }));

    try {
      const base64Data = state.originalImage.split(",")[1];
      const promptText = trimmedUserRequest;
      const contextText = trimmedResearchNotes;

      const diagnosis = await generateFacialReport(base64Data);
      const diagnosticImageUrl = diagnosis.reportImage
        ? `data:image/png;base64,${diagnosis.reportImage}`
        : null;

      setState((prev) => ({
        ...prev,
        diagnosticImage: diagnosticImageUrl,
        diagnosticSummary: diagnosis.summary,
        diagnosticMetrics: diagnosis.metrics,
      }));

      const diagnosisContext = `${diagnosis.summary}. Metrics: ${diagnosis.metrics
        .map((metric) => `${metric.label} ${metric.score}%`)
        .join(", ")}`;

      const [generatedImgB64, productData] = await Promise.all([
        generateMakeupLook(base64Data, promptText, contextText, diagnosisContext),
        searchProducts(base64Data, promptText, contextText, diagnosisContext),
      ]);

      setState((prev) => ({
        ...prev,
        isLoading: false,
        generatedImage: `data:image/jpeg;base64,${generatedImgB64}`,
        products: productData.products,
        lookDescription: productData.description,
      }));
    } catch (err: any) {
      console.error(err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          "Failed to run the facial report. Please try a clearer portrait or retry shortly.",
      }));
    }
  };

  const handleSaveImage = async () => {
    if (isSavingImage || !canSaveShareCard) return;
    const target = shareCardRef.current;
    if (!target) return;

    setIsSavingImage(true);
    const originalScrollY = window.scrollY;

    try {
      window.scrollTo(0, 0);
      const dataUrl = await toPng(target, {
        cacheBust: true,
        backgroundColor: "#000000",
        pixelRatio: window.devicePixelRatio || 1,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `find-your-beauty-${Date.now()}.png`;
      link.click();
    } catch (error) {
      console.error("Failed to save snapshot:", error);
    } finally {
      window.scrollTo(0, originalScrollY);
      setIsSavingImage(false);
    }
  };

  const handleShare = () => {
    if (!state.lookDescription) return;

    // Create a shareable object (excluding images to save URL space)
    const shareData: SharedData = {
      desc: state.lookDescription,
      prods: state.products,
    };

    try {
      const hash = encodeURIComponent(btoa(JSON.stringify(shareData)));
      const url = `${window.location.origin}${window.location.pathname}#${hash}`;
      navigator.clipboard.writeText(url);
      setShareUrl(url);
      setTimeout(() => setShareUrl(null), 3000); // Hide message after 3s
    } catch (e) {
      console.error("Could not create share link", e);
    }
  };

  const reset = () => {
    setState({
      originalImage: null,
      generatedImage: null,
       diagnosticImage: null,
      products: [],
      isLoading: false,
      error: null,
      lookDescription: null,
      diagnosticSummary: null,
      diagnosticMetrics: [],
    });
    setUserRequest("");
    setResearchNotes("");
    window.location.hash = "";
  };

  return (
    <div
      ref={pageRef}
      className="min-h-screen bg-black text-gray-200 selection:bg-neon-500 selection:text-black font-sans"
    >
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-neon-900/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-neon-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <header className="flex flex-col items-center mb-16 text-center">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="text-neon-400 animate-pulse" size={24} />
            <span className="text-neon-400 font-bold tracking-widest uppercase text-sm">
              AI Beauty Advisor
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-6 tracking-tight">
            Find Your{" "}
            <span className="text-neon-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]">
              Beauty
            </span>
          </h1>
          <p className="max-w-2xl text-gray-400 text-lg leading-relaxed">
            Upload your photo and describe your desired makeup style. Get personalized product recommendations
            and see how you'd look with those products applied!
          </p>
        </header>

        {/* Main Content Area */}
        <main>
          {state.error && (
            <div className="max-w-xl mx-auto mb-8 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-200 text-center">
              {state.error}
            </div>
          )}

          {!state.generatedImage &&
          !state.products.length &&
          !state.isLoading ? (
            /* Upload Section */
            <div className="max-w-xl mx-auto bg-neutral-900/50 border border-neutral-800 rounded-2xl p-8 backdrop-blur-sm text-center shadow-2xl">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />

              {!state.originalImage && !isCameraMode ? (
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-neutral-700 hover:border-neon-500 rounded-xl p-12 cursor-pointer transition-all duration-300 group flex flex-col items-center justify-center min-h-[200px]"
                  >
                    <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="text-neon-400" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      Upload Photo
                    </h3>
                    <p className="text-gray-500">
                      Tap to select a photo from your device
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-neutral-700"></div>
                    <span className="text-gray-500 text-sm">OR</span>
                    <div className="flex-1 h-px bg-neutral-700"></div>
                  </div>

                  <button
                    onClick={startCamera}
                    className="w-full border-2 border-neutral-700 hover:border-neon-500 rounded-xl p-8 cursor-pointer transition-all duration-300 group flex flex-col items-center justify-center bg-neutral-800/50 hover:bg-neutral-800"
                  >
                    <div className="w-20 h-20 bg-neutral-700 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Camera className="text-neon-400" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      Take Photo
                    </h3>
                    <p className="text-gray-500">
                      Use your camera to take a selfie
                    </p>
                  </button>
                </div>
              ) : isCameraMode ? (
                <div className="space-y-6">
                  <div className="relative rounded-xl overflow-hidden shadow-2xl mx-auto bg-black">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover min-h-[400px] scale-x-[-1]"
                    />
                    <button
                      onClick={stopCamera}
                      className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-md transition-colors z-10"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <Button onClick={capturePhoto} className="w-full text-lg">
                    <Camera className="mr-2" size={18} /> Capture Photo
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="relative rounded-xl overflow-hidden shadow-2xl mx-auto max-h-[500px] bg-neutral-900 flex items-center justify-center">
                    <img
                      src={state.originalImage}
                      alt="Original"
                      className="w-full h-auto object-contain max-h-[500px]"
                    />
                    <button
                      onClick={reset}
                      className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-md transition-colors"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>

                  {/* User Request Input */}
                  <div className="space-y-2">
                    <label
                      htmlFor="user-request"
                      className="block text-sm font-medium text-gray-300 text-left"
                    >
                      What kind of makeup look would you like? (Optional)
                    </label>
                    <input
                      id="user-request"
                      type="text"
                      value={userRequest}
                      onChange={(e) => setUserRequest(e.target.value)}
                      placeholder="e.g., Cool-tone pink lipstick, natural everyday look, dewy glass skin..."
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-neon-500 focus:ring-1 focus:ring-neon-500 transition-colors"
                    />
                    <p className="text-xs text-gray-500 text-left">
                      Describe your desired makeup style, products, or skin tone preferences
                    </p>
                  </div>

                  <Button onClick={handleProcess} className="w-full text-lg">
                    Generate My Look <Sparkles className="ml-2" size={18} />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* Result Section */
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
              {/* Image Compare / Display */}
              <div className="grid gap-8 mb-16 lg:grid-cols-3">
                {/* Original */}
                <div className="relative rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-neutral-800 bg-neutral-900 group">
                  <div className="absolute top-4 left-4 bg-black/70 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-bold tracking-wider z-10 border border-white/10">
                    ORIGINAL
                  </div>
                  {state.originalImage ? (
                    <img
                      src={state.originalImage}
                      alt="Original"
                      className="w-full h-full object-cover min-h-[400px]"
                    />
                  ) : (
                    <div className="w-full h-full min-h-[400px] flex items-center justify-center text-gray-500 bg-neutral-900">
                      <p>Image not saved in share link</p>
                    </div>
                  )}
                </div>

                {/* Diagnostic Poster */}
                <div className="relative rounded-2xl overflow-hidden border border-slate-100/10 bg-neutral-900 shadow-[0_0_35px_rgba(148,163,184,0.25)]">
                  <div className="absolute top-4 left-4 bg-white/10 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-bold tracking-[0.3em] z-10 border border-white/20">
                    FACIAL REPORT
                  </div>
                  {state.diagnosticImage ? (
                    <img
                      src={state.diagnosticImage}
                      alt="Facial report"
                      className="w-full h-full object-cover min-h-[400px]"
                    />
                  ) : (
                    <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center text-gray-500">
                      <p>
                        {state.isLoading
                          ? "Generating diagnostic overlay..."
                          : "Run analysis to view poster."}
                      </p>
                    </div>
                  )}
                </div>

                {/* AI Makeover */}
                <div className="relative rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(74,222,128,0.2)] border border-neon-500/30 bg-neutral-900">
                  <div className="absolute top-4 left-4 bg-neon-500/90 text-black px-3 py-1 rounded-full text-xs font-bold tracking-wider z-10 shadow-lg">
                    AI MAKEOVER
                  </div>
                  {state.isLoading ? (
                    <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center space-y-4">
                      <div className="w-16 h-16 border-4 border-neon-500/30 border-t-neon-500 rounded-full animate-spin"></div>
                      <p className="text-neon-400 animate-pulse font-medium">
                        Applying makeup...
                      </p>
                    </div>
                  ) : state.generatedImage ? (
                    <img
                      src={state.generatedImage}
                      alt="Generated"
                      className="w-full h-full object-cover min-h-[400px]"
                    />
                  ) : (
                    <div className="w-full h-full min-h-[400px] flex items-center justify-center text-gray-500">
                      <p>Generate a look to preview</p>
                    </div>
                  )}
                </div>
              </div>

              {state.diagnosticSummary && (
                <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-8 mb-16 shadow-[0_0_30px_rgba(148,163,184,0.15)]">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.4em] text-neon-400 font-semibold">
                        Facial Aesthetic Report
                      </p>
                      <p className="text-gray-200 text-lg mt-3 leading-relaxed">
                        {state.diagnosticSummary}
                      </p>
                    </div>
                    {overallMetric && (
                      <div className="text-center bg-black/50 border border-white/10 rounded-2xl px-10 py-6">
                        <p className="text-xs uppercase tracking-[0.5em] text-gray-400">
                          Overall Score
                        </p>
                        <p className="text-5xl font-black text-neon-400 mt-2">
                          {overallMetric.score}%
                        </p>
                      </div>
                    )}
                  </div>
                  {state.diagnosticMetrics.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-8">
                      {state.diagnosticMetrics.map((metric, idx) => (
                        <div
                          key={`${metric.label}-${idx}`}
                          className="rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                        >
                          <p className="text-[10px] uppercase tracking-[0.35em] text-gray-400 font-semibold">
                            {metric.label}
                          </p>
                          <p className="text-2xl font-bold text-white mt-2">
                            {metric.score}%
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Analysis & Recommendations */}
              {!state.isLoading && (
                <div className="space-y-12">
                  {/* User Request Input - Keep visible for re-generation */}
                  <div className="max-w-3xl mx-auto bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
                    <div className="space-y-2">
                      <label
                        htmlFor="user-request-results"
                        className="block text-sm font-semibold text-gray-300 uppercase tracking-wide"
                      >
                        Makeup request
                      </label>
                      <input
                        id="user-request-results"
                        type="text"
                        value={userRequest}
                        onChange={(e) => setUserRequest(e.target.value)}
                        placeholder='예: "립스틱을 바르고 싶어" 또는 "글리터 강조 아이돌 메이크업"'
                        className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-neon-500 focus:ring-1 focus:ring-neon-500 transition-colors"
                      />
                      <p className="text-xs text-gray-500 text-left">
                        Update the request to focus on a new area or vibe.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="research-notes-results"
                        className="block text-sm font-semibold text-gray-300 uppercase tracking-wide"
                      >
                        Research notes
                      </label>
                      <textarea
                        id="research-notes-results"
                        rows={3}
                        value={researchNotes}
                        onChange={(e) => setResearchNotes(e.target.value)}
                        placeholder="Paste YouTube 영상 설명, 댓글 요약, 구글 검색 결과 등 참고 내용"
                        className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-neon-500 focus:ring-1 focus:ring-neon-500 transition-colors resize-none"
                      />
                      <p className="text-xs text-gray-500 text-left">
                        The AI will weave these notes into both the makeover and recommendations.
                      </p>
                    </div>
                    <Button onClick={handleProcess} className="w-full text-lg" disabled={state.isLoading}>
                      Regenerate Look <Sparkles className="ml-2" size={18} />
                    </Button>
                  </div>

                  {/* Description Box */}
                  <div className="bg-neutral-900/60 border border-neutral-800 p-8 rounded-2xl text-center max-w-3xl mx-auto backdrop-blur-md relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-500 to-transparent opacity-50"></div>
                    <h2 className="text-2xl font-bold text-white mb-4">
                      Your Beauty Profile
                    </h2>
                    <p className="text-gray-300 text-lg leading-relaxed italic">
                      "
                      {state.lookDescription ||
                        "A curated look tailored to your diagnosis."}
                      "
                    </p>
                  </div>

                  {/* Products Grid */}
                  <div>
                    <h2 className="text-3xl font-bold text-center mb-10">
                      Recommended Products{" "}
                      <span className="text-neon-400">.</span>
                    </h2>

                    {state.products.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {state.products.map((product, idx) => (
                          <ProductCard
                            key={idx}
                            product={product}
                            index={idx}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-10">
                        No specific products found. Try generating again.
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row justify-center gap-4 pt-8 border-t border-neutral-800">
                    <Button onClick={reset} variant="secondary">
                      <RefreshCw className="mr-2" size={18} /> Try Another Photo
                    </Button>
                    <Button
                      onClick={handleSaveImage}
                      variant="secondary"
                      isLoading={isSavingImage}
                      disabled={isSavingImage || !canSaveShareCard}
                    >
                      <Download className="mr-2" size={18} /> Save Snapshot
                    </Button>
                    <Button onClick={handleShare}>
                      {shareUrl ? "Link Copied!" : "Share Results"}{" "}
                      <Share2 className="ml-2" size={18} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="mt-24 text-center text-gray-600 text-sm py-8 border-t border-neutral-900">
          <p>© 2024 Find Your Beauty. Powered by Google Gemini.</p>
          <p className="mt-2 text-xs">
            Products sourced from Global Olive Young.
          </p>
        </footer>
      </div>

      {/* Hidden share card used for the downloadable snapshot */}
      <div className="fixed -left-[2000px] top-0 pointer-events-none select-none">
        <div
          ref={shareCardRef}
          className="w-[1200px] h-[675px] bg-gradient-to-br from-black via-neutral-900 to-black text-white rounded-[32px] border border-neon-500/40 shadow-[0_20px_60px_rgba(0,0,0,0.65)] p-12 flex flex-col gap-6 overflow-hidden"
        >
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-neon-400 font-semibold">
                Find Your Beauty
              </p>
              <h2 className="text-4xl font-black mt-2 leading-tight">
                Facial Aesthetic Report & Makeover
              </h2>
              <p className="text-gray-400 mt-3 text-sm">
                {trimmedUserRequest
                  ? `Request: ${trimmedUserRequest}`
                  : "Request: Custom AI makeover"}
              </p>
              {trimmedResearchNotes && (
                <p className="text-gray-500 text-xs mt-1">
                  Research: {trimmedResearchNotes}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.4em] text-gray-500">
                Powered By
              </p>
              <p className="text-neon-400 font-semibold text-xl">
                Google Gemini
              </p>
            </div>
          </div>

          <div className="flex flex-1 gap-6">
            <div className="flex-1 relative rounded-[28px] border border-white/10 bg-neutral-900 overflow-hidden flex items-center justify-center">
              <div className="absolute top-6 left-6 bg-white/15 px-4 py-1 rounded-full text-xs tracking-[0.3em] font-semibold">
                FACIAL REPORT
              </div>
              {state.diagnosticImage ? (
                <img
                  src={state.diagnosticImage}
                  alt="Facial report"
                  className="w-full h-full object-cover"
                />
              ) : (
                <p className="text-gray-600 text-lg">Generate report</p>
              )}
            </div>
            <div className="flex-1 relative rounded-[28px] border border-neon-500/40 bg-neutral-900 overflow-hidden flex items-center justify-center shadow-[0_0_45px_rgba(74,222,128,0.25)]">
              <div className="absolute top-6 left-6 bg-neon-500/90 text-black px-4 py-1 rounded-full text-xs tracking-[0.3em] font-black">
                AI MAKEOVER
              </div>
              {state.generatedImage ? (
                <img
                  src={state.generatedImage}
                  alt="Generated"
                  className="w-full h-full object-cover"
                />
              ) : (
                <p className="text-gray-500 text-lg text-center px-4">
                  Awaiting makeover
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {state.diagnosticMetrics.map((metric, idx) => (
              <div
                key={`share-metric-${metric.label}-${idx}`}
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
              >
                <p className="text-[10px] uppercase tracking-[0.35em] text-gray-400 font-semibold">
                  {metric.label}
                </p>
                <p className="text-2xl font-bold text-white mt-2">
                  {metric.score}%
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-neutral-900/70 border border-white/10 rounded-[24px] p-6 relative">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <p className="text-sm uppercase tracking-[0.4em] text-white/70 font-semibold">
                Diagnostic Summary
              </p>
              <p className="text-lg mt-3 leading-relaxed text-gray-100">
                {state.diagnosticSummary ||
                  "Run the analysis to receive a clinical breakdown."}
              </p>
            </div>
            <div className="bg-neutral-900/70 border border-white/10 rounded-[24px] p-6 relative">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-neon-500/60 to-transparent" />
              <p className="text-sm uppercase tracking-[0.4em] text-neon-400 font-semibold">
                Makeover Brief
              </p>
              <p className="text-lg mt-3 leading-relaxed text-gray-100">
                {state.lookDescription || "A custom look curated just for you."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
