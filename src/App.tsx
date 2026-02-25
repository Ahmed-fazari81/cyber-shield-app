import React, { useState, useRef, useEffect } from 'react';
import { Shield, Info, BookOpen, HelpCircle, Upload, Camera, Link as LinkIcon, FileText, Video, Download, AlertTriangle, CheckCircle, Loader2, Image as ImageIcon, RefreshCw, Key } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';

export default function App() {
  const [activeTab, setActiveTab] = useState('text');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ analysis: string, recommendations: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [userApiKey, setUserApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');

  const saveApiKey = () => {
    const key = tempApiKey.trim();
    localStorage.setItem('gemini_api_key', key);
    setUserApiKey(key);
    setShowApiKeyModal(false);
  };

  // Handle shared content from Web Share Target API
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedTitle = params.get('title');
    const sharedText = params.get('text');
    const sharedUrl = params.get('url');

    let combinedText = '';
    if (sharedTitle) combinedText += sharedTitle + '\n';
    if (sharedText) combinedText += sharedText + '\n';
    if (sharedUrl) combinedText += sharedUrl;

    if (combinedText.trim()) {
      setInputText(combinedText.trim());
      setActiveTab('text');
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Handle paste events globally
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // If user is already typing in an input, let the input handle it
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Handle pasted files/images
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            if (file.type.startsWith('image/')) {
              setActiveTab('image');
            } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
              setActiveTab('video');
            } else {
              setActiveTab('file');
            }
            
            // Simulate file selection
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            handleFileChange({ target: { files: dataTransfer.files } } as any);
            return; // Stop after first file
          }
        }
        
        // Handle pasted text/links
        if (item.kind === 'string' && item.type === 'text/plain') {
          item.getAsString((text) => {
            setInputText(text);
            setActiveTab('text');
          });
          return;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Check file size (max 20MB for inline data)
      if (file.size > 20 * 1024 * 1024) {
        setError('حجم الملف كبير جداً. يرجى رفع ملف بحجم أقل من 20 ميجابايت.');
        return;
      }
      setSelectedFile(file);
      setError(null);
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setFilePreview(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleScan = async () => {
    if (!userApiKey) {
      setTempApiKey(userApiKey);
      setShowApiKeyModal(true);
      return;
    }

    if (!inputText && !selectedFile) {
      setError('يرجى إدخال نص، رابط، أو رفع ملف للفحص.');
      return;
    }

    setIsScanning(true);
    setError(null);
    setScanResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: userApiKey });
      const parts: any[] = [];
      
      let promptText = `أنت خبير في الأمن السيبراني. قم بتحليل المحتوى التالي بدقة لاكتشاف أي تهديدات سيبرانية، مثل التزييف العميق (Deepfake)، الهندسة الاجتماعية، التصيد الاحتيالي (Phishing)، الروابط الخبيثة، البرمجيات الضارة، أو رموز QR المفخخة.
إذا كان المحتوى يحتوي على رمز QR، قم باستخراج الرابط أو النص الموجود بداخله واذكره في التحليل مع فحص مدى أمانه.
إذا كان المحتوى صورة أو مقطع فيديو، قم بتحليله بدقة لمعرفة ما إذا كان مولداً بالذكاء الاصطناعي أو يحتوي على تزييف عميق (Deepfake) واذكر الأدلة على ذلك.`;
      
      if (inputText) {
        promptText += `\n\nالمحتوى النصي أو الرابط: ${inputText}`;
      }
      
      parts.push({ text: promptText });

      if (selectedFile) {
        const base64 = await fileToBase64(selectedFile);
        parts.push({
          inlineData: {
            data: base64.split(',')[1],
            mimeType: selectedFile.type
          }
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING, description: "التحليل المفصل للمحتوى والمخاطر المحتملة" },
              recommendations: { type: Type.STRING, description: "التوصيات والإجراءات الوقائية المقترحة" }
            },
            required: ["analysis", "recommendations"]
          }
        }
      });

      if (response.text) {
        const result = JSON.parse(response.text);
        setScanResult(result);
      } else {
        throw new Error("لم يتم استلام استجابة صالحة.");
      }
    } catch (err: any) {
      console.error(err);
      
      const errorMessage = err.message || '';
      if (errorMessage.includes('leaked') || errorMessage.includes('compromised') || errorMessage.includes('403')) {
        setError('عذراً، يبدو أن مفتاح API الحالي غير صالح أو تم إيقافه. يرجى إنشاء مفتاح جديد من منصة Google AI Studio والمحاولة مرة أخرى.');
      } else if (errorMessage.includes('API key not valid') || errorMessage.includes('API_KEY_INVALID')) {
        setError('مفتاح API غير صالح. يرجى التأكد من إدخال المفتاح الصحيح.');
      } else if (errorMessage.includes('quota') || errorMessage.includes('429')) {
        setError('لقد تجاوزت الحد المسموح به للاستخدام المجاني (Quota). يرجى المحاولة لاحقاً أو ترقية حسابك.');
      } else if (errorMessage.includes('503') || errorMessage.includes('high demand') || errorMessage.includes('UNAVAILABLE')) {
        setError('عذراً، خوادم الذكاء الاصطناعي تواجه ضغطاً عالياً حالياً. يرجى المحاولة مرة أخرى بعد قليل.');
      } else {
        setError('حدث خطأ أثناء الفحص. يرجى المحاولة مرة أخرى. ' + errorMessage);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const downloadReport = () => {
    if (!scanResult) return;
    
    const reportContent = `تقرير الفحص الأمني\n\nالتحليل:\n${scanResult.analysis}\n\nالتوصيات:\n${scanResult.recommendations}\n\nتم الفحص بواسطة تطبيق الأمن السيبراني`;
    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'تقرير_الفحص_الأمني.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const clearInput = () => {
    setInputText('');
    setSelectedFile(null);
    setFilePreview(null);
    setScanResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-200 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white py-6 px-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-10 h-10 text-emerald-400" />
            <h1 className="text-3xl font-bold tracking-tight">الدرع السيبراني</h1>
          </div>
          
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => setActiveModal('about')} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full text-sm font-medium transition-colors border border-slate-700">
              <Info className="w-4 h-4" />
              عن التطبيق
            </button>
            <button onClick={() => setActiveModal('guide')} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full text-sm font-medium transition-colors border border-slate-700">
              <BookOpen className="w-4 h-4" />
              دليل المستخدم
            </button>
            <button onClick={() => setActiveModal('faq')} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full text-sm font-medium transition-colors border border-slate-700">
              <HelpCircle className="w-4 h-4" />
              الأسئلة الشائعة
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 w-full flex-grow">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-slate-100 bg-slate-50/50">
            <TabButton active={activeTab === 'text'} onClick={() => { setActiveTab('text'); clearInput(); }} icon={<LinkIcon className="w-4 h-4" />} label="رابط / نص" />
            <TabButton active={activeTab === 'file'} onClick={() => { setActiveTab('file'); clearInput(); }} icon={<FileText className="w-4 h-4" />} label="ملف / إيميل" />
            <TabButton active={activeTab === 'image'} onClick={() => { setActiveTab('image'); clearInput(); }} icon={<ImageIcon className="w-4 h-4" />} label="صورة" />
            <TabButton active={activeTab === 'video'} onClick={() => { setActiveTab('video'); clearInput(); }} icon={<Video className="w-4 h-4" />} label="فيديو / صوت" />
          </div>

          {/* Input Area */}
          <div className="p-6">
            {activeTab === 'text' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">أدخل الرابط أو النص المشبوه:</label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="https://example.com أو الصق رسالة البريد الإلكتروني هنا..."
                  className="w-full h-32 p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none transition-all"
                  dir="auto"
                />
              </div>
            )}

            {activeTab === 'file' && (
              <FileUploadArea 
                onFileSelect={handleFileChange} 
                selectedFile={selectedFile} 
                accept=".pdf,.doc,.docx,.txt,.eml,.msg,.csv" 
                label="اسحب وأفلت الملف أو البريد الإلكتروني هنا" 
              />
            )}

            {activeTab === 'image' && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-slate-600"
                  >
                    <Upload className="w-8 h-8 text-slate-400" />
                    <span>رفع من الجهاز</span>
                  </button>
                  <button 
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-slate-600"
                  >
                    <Camera className="w-8 h-8 text-slate-400" />
                    <span>التقاط صورة</span>
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                <input 
                  type="file" 
                  ref={cameraInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  capture="environment" 
                  className="hidden" 
                />
                {filePreview && (
                  <div className="mt-4 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex justify-center">
                    <img src={filePreview} alt="Preview" className="max-h-64 object-contain" />
                  </div>
                )}
                {selectedFile && !filePreview && (
                  <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    <span>تم اختيار: {selectedFile.name}</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'video' && (
              <FileUploadArea 
                onFileSelect={handleFileChange} 
                selectedFile={selectedFile} 
                accept="video/*,audio/*" 
                label="اسحب وأفلت مقطع الفيديو أو الصوت هنا" 
              />
            )}

            {/* Common Paste Field */}
            {activeTab !== 'text' && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">أو قم بلصق الرابط / النص هنا:</label>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="لصق الرابط..."
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  dir="auto"
                />
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={handleScan}
                disabled={isScanning || (!inputText && !selectedFile)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 w-full sm:w-auto min-w-[200px] justify-center"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    جاري الفحص...
                  </>
                ) : (
                  <>
                    <Shield className="w-6 h-6" />
                    فحص الآن
                  </>
                )}
              </button>
              <button
                onClick={() => { setTempApiKey(userApiKey); setShowApiKeyModal(true); }}
                className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all flex items-center gap-3 w-full sm:w-auto justify-center"
              >
                <Key className="w-6 h-6" />
                مفتاح API
              </button>
            </div>
          </div>
        </div>

        {/* Results Section */}
        {scanResult && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
                نتيجة الفحص
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={clearInput}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  فحص جديد
                </button>
                <button 
                  onClick={downloadReport}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  تحميل التقرير
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  التحليل
                </h3>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {scanResult.analysis}
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-500" />
                  التوصيات
                </h3>
                <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {scanResult.recommendations}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-6 text-center mt-auto border-t border-slate-800">
        <p className="font-medium tracking-wide">تصميم : أحمد الفزاري</p>
      </footer>

      {/* Modals */}
      {activeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-900">
                {activeModal === 'about' && 'عن التطبيق'}
                {activeModal === 'guide' && 'دليل المستخدم'}
                {activeModal === 'faq' && 'الأسئلة الشائعة'}
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="text-slate-600 leading-relaxed">
              {activeModal === 'about' && (
                <p>تطبيق ويب تقدمي يعتمد على الذكاء الاصطناعي لفحص الروابط، الملفات، الصور، ومقاطع الفيديو لاكتشاف التزييف العميق، الهندسة الاجتماعية، والبرمجيات الخبيثة لحمايتك من الاختراق والتجسس.</p>
              )}
              {activeModal === 'guide' && (
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>أولاً:</strong> اضغط على زر "مفتاح API" وأدخل مفتاح Gemini الخاص بك (يمكن الحصول عليه مجاناً من Google AI Studio).</li>
                  <li>اختر نوع المحتوى المراد فحصه من التبويبات.</li>
                  <li>قم برفع الملف أو لصق الرابط/النص.</li>
                  <li>اضغط على زر "فحص الآن".</li>
                  <li>انتظر قليلاً حتى يقوم الذكاء الاصطناعي بتحليل المحتوى.</li>
                  <li>اقرأ التحليل والتوصيات، ويمكنك تحميل التقرير.</li>
                </ul>
              )}
              {activeModal === 'faq' && (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  <div>
                    <h4 className="font-bold text-slate-800">ما الفرق بين هذا التطبيق وبرامج مكافحة الفيروسات؟</h4>
                    <p className="text-sm mt-1 text-slate-600">برامج مكافحة الفيروسات التقليدية تعتمد غالباً على قواعد بيانات للبرمجيات الخبيثة المعروفة مسبقاً. بينما هذا التطبيق يعتمد على الذكاء الاصطناعي لتحليل "السياق" والمحتوى، مما يمكنه من كشف التهديدات المعقدة والحديثة مثل التزييف العميق (Deepfake)، أساليب الهندسة الاجتماعية، ورسائل التصيد الاحتيالي الماكرة التي قد تتجاوز برامج الحماية التقليدية.</p>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">كيف أحصل على مفتاح Gemini API؟</h4>
                    <p className="text-sm mt-1 text-slate-600">يمكنك الحصول عليه مجاناً بزيارة منصة (Google AI Studio)، وتسجيل الدخول بحساب جوجل، ثم النقر على "Get API key" وإنشاء مفتاح جديد ونسخه ولصقه في التطبيق.</p>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">هل الفحص دقيق 100%؟</h4>
                    <p className="text-sm mt-1 text-slate-600">يعتمد الفحص على نماذج ذكاء اصطناعي متقدمة جداً، لكن يُنصح دائماً بتوخي الحذر وعدم الاعتماد الكلي والنهائي على النتائج، حيث قد تظهر أحياناً استنتاجات غير دقيقة.</p>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">هل يتم حفظ ملفاتي أو مفتاح الـ API الخاص بي؟</h4>
                    <p className="text-sm mt-1 text-slate-600">لا، يتم إرسال الملفات للتحليل اللحظي فقط ولا يتم تخزينها. أما مفتاح الـ API الخاص بك فيتم حفظه محلياً في متصفحك (Local Storage) ولا يتم إرساله لأي جهة خارجية.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 text-center">
              <button onClick={() => setActiveModal(null)} className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {showApiKeyModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Key className="w-6 h-6 text-emerald-500" />
              إعداد مفتاح Gemini API
            </h3>
            <div className="text-sm text-slate-600 mb-6 space-y-3">
              <p>لاستخدام التطبيق، يرجى إدخال مفتاح API الخاص بك من Google Gemini.</p>
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-emerald-800">
                <span className="font-bold block mb-1">أين يتم حفظ المفتاح؟</span>
                يتم حفظ المفتاح محلياً في متصفحك فقط (Local Storage). لا يتم إرساله إلى أي خادم خارجي أو قاعدة بيانات، مما يضمن خصوصيتك التامة.
              </div>
            </div>
            <input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none mb-6 text-left"
              dir="ltr"
            />
            <div className="flex gap-3">
              <button onClick={saveApiKey} disabled={!tempApiKey.trim()} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                حفظ ومتابعة
              </button>
              <button onClick={() => setShowApiKeyModal(false)} className="flex-1 bg-slate-200 text-slate-800 py-3 rounded-xl font-bold hover:bg-slate-300 transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-4 font-medium text-sm whitespace-nowrap transition-all border-b-2 ${
        active 
          ? 'border-emerald-500 text-emerald-600 bg-white' 
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FileUploadArea({ onFileSelect, selectedFile, accept, label }: { onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void, selectedFile: File | null, accept: string, label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <div 
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-slate-300 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-slate-600"
      >
        <Upload className="w-10 h-10 text-slate-400" />
        <span className="font-medium">{label}</span>
        <span className="text-xs text-slate-400">انقر للاختيار أو اسحب الملف هنا</span>
      </div>
      <input 
        type="file" 
        ref={inputRef} 
        onChange={onFileSelect} 
        accept={accept} 
        className="hidden" 
      />
      {selectedFile && (
        <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium truncate max-w-[200px] sm:max-w-xs">{selectedFile.name}</span>
          </div>
          <span className="text-sm opacity-80">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
      )}
    </div>
  );
}
