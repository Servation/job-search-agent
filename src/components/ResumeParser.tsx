/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FileText, ArrowRight, Sparkles, Check, Edit2, Upload } from 'lucide-react';
import { ResumeProfile, LLMConfig } from '../types';

interface ResumeParserProps {
  profile: ResumeProfile;
  onChangeProfile: (profile: ResumeProfile) => void;
  onParseComplete: (parsed: { name?: string; skills?: string[]; roles?: string[]; location?: string }) => void;
  addAiLog: (msg: string) => void;
  llmConfig: LLMConfig;
}

export default function ResumeParser({ profile, onChangeProfile, onParseComplete, addAiLog, llmConfig }: ResumeParserProps) {
  const [resumeText, setResumeText] = useState(profile.rawText);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setParseError(null);
    setIsParsing(true);
    addAiLog(`ResumeParser: Selected file "${file.name}" (${file.type || "unknown mime"}).`);

    if (file.type === "application/pdf") {
      addAiLog(`ResumeParser: Sending PDF attachment to server parser (Model: ${llmConfig.modelName})...`);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const urlPart = event.target?.result as string;
        if (urlPart) {
          try {
            const base64Data = urlPart.split(',')[1];
            
            // Server call
            const response = await fetch('/api/resume/parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileBase64: base64Data, mimeType: 'application/pdf', llmConfig }),
            });

            if (!response.ok) {
              const errMsg = await response.text();
              throw new Error(errMsg || "Failed parsing the PDF document on server.");
            }

            const data = await response.json();
            
            const extractedText = data.extractedRawText || "";
            setResumeText(extractedText);
            
            addAiLog(`ResumeParser: PDF extraction successful (Applicant Name: "${data.parsedName || "Not Found"}"). Extracted ${data.parsedSkills?.length || 0} skills.`);

            onParseComplete({
              name: data.parsedName,
              skills: data.parsedSkills,
              roles: data.targetRoles,
              location: data.preferredLocation,
            });

            onChangeProfile({
              ...profile,
              rawText: extractedText,
              parsedName: data.parsedName || "Applicant Profile",
              parsedSkills: data.parsedSkills || [],
              targetRoles: data.targetRoles || [],
              preferredLocation: data.preferredLocation || 'Remote',
            });

            setSuccessMsg(true);
            setTimeout(() => setSuccessMsg(false), 4500);
          } catch (err: any) {
            console.warn("PDF Server parsing error. Falling back.", err);
            addAiLog(`ResumeParser Warning: PDF server processing failed (${err.message || "Unknown error"}). Checking local heuristics...`);
            setParseError(`Could not parse PDF automatically: ${err.message || 'Verification Error'}. Ensure your LLM model server is online and endpoint configuration in Settings is correct. Alternatively, you can copy and paste the plain text of your resume below.`);
            // Mock content as a failsafe so they don't break but clearly see the advice
            const parsedMockName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
            const fallbackContent = `${parsedMockName}\nUploaded PDF: ${file.name}\nPlease copy and paste or input details manually to parse with local heuristics.`;
            setResumeText(fallbackContent);
            fallbackParser(fallbackContent);
          } finally {
            setIsParsing(false);
          }
        }
      };
      reader.onerror = () => {
        addAiLog("ResumeParser Error: Could not read local file binary.");
        setParseError("Failed to read the PDF file contents.");
        setIsParsing(false);
      };
      reader.readAsDataURL(file);
    } else {
      // Standard plain text file
      addAiLog("ResumeParser: Reading plain text resume file...");
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        if (text) {
          setResumeText(text);
          addAiLog("ResumeParser: Sending text document to server parser...");
          try {
            const response = await fetch('/api/resume/parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rawText: text, llmConfig }),
            });

            if (!response.ok) {
              throw new Error("Failed server parse");
            }

            const data = await response.json();
            addAiLog(`ResumeParser: Server parse successful. Extracted candidate name: "${data.parsedName || "Not Found"}".`);
            onParseComplete({
              name: data.parsedName,
              skills: data.parsedSkills,
              roles: data.targetRoles,
              location: data.preferredLocation,
            });

            onChangeProfile({
              ...profile,
              rawText: text,
              parsedName: data.parsedName || "Applicant Profile",
              parsedSkills: data.parsedSkills || [],
              targetRoles: data.targetRoles || [],
              preferredLocation: data.preferredLocation || 'Remote',
            });

            setSuccessMsg(true);
            setTimeout(() => setSuccessMsg(false), 4500);
          } catch (err) {
            console.warn("Server text file parse error. Falling back to local keyword heuristics.");
            addAiLog("ResumeParser Event: Server parser failed. Running edge keyword regex heuristics on text profile...");
            fallbackParser(text);
          } finally {
            setIsParsing(false);
          }
        } else {
          setIsParsing(false);
        }
      };
      reader.onerror = () => {
        addAiLog("ResumeParser Error: Reading plain text file failed.");
        setParseError("Failed to read the file contents.");
        setIsParsing(false);
      };
      reader.readAsText(file);
    }
  };

  // Suggested sample resume for testing
  const loadSampleResume = () => {
    const sample = `Alex Mercer
alex.mercer@email.dev | (555) 019-2831 | New York, NY (Hybrid/Remote)
GitHub: github.com/alex-dev | Portfolio: alexmercer.dev

SUMMARY
Versatile Software Engineer with 5+ years of experience crafting elite, reactive single-page applications. Deep mastery in React, TypeScript, and client-side performance engineering. Passionate about beautiful UX, typographic rhythm, and performance metrics.

CORE SKILLS
• Languages: TypeScript, JavaScript (ESNext), Python, HTML5/CSS3
• Frameworks/Libraries: React 18, Next.js, Framer Motion, TailWind CSS, Node.js, Express, Recharts, D3.js
• Tools: Vite, ESBuild, Git, Docker, AWS (S3, CloudRun/ECS), CI/CD, Jest

EXPERIENCE
Senior Frontend Engineer | Linear Technologies (2023 - Present)
• Formulated a performance-critical collaborative tracking interface that boosted user session duration by 35%.
• Architected dynamic dashboard components using Recharts reducing payload delivery by 40%.
• Mentored 4 junior engineers on React state design, resolving infinite re-render loops and minimizing DOM weight.

Full-Stack Developer | Stripe Systems Contract (2021 - 2023)
• Developed responsive checkout portals supporting dynamic W2 and contract developer roles.
• Embedded structured duplicate verification caches preventing triple-tap event anomalies during payment routines.
• Maintained automated testing dashboards achieving 92% test coverage.

EDUCATION
B.S. in Computer Science | New York University (2017 - 2021)`;
    setResumeText(sample);
  };

  const handleParse = async () => {
    if (!resumeText.trim()) {
      setParseError("Please input or paste resume content.");
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setSuccessMsg(false);
    addAiLog("ResumeParser: Manual parse initiated by candidate. Connecting to server backend...");

    try {
      // Call the express parser route
      const response = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: resumeText, llmConfig }),
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Failed parsing resume on server.");
      }

      const data = await response.json();
      addAiLog(`ResumeParser: Server analyzed plain text. Candidate Name parsed: "${data.parsedName || "Candidate"}", Skills count: ${data.parsedSkills?.length || 0}.`);
      
      onParseComplete({
        name: data.parsedName,
        skills: data.parsedSkills,
        roles: data.targetRoles,
        location: data.preferredLocation,
      });

      onChangeProfile({
        ...profile,
        rawText: resumeText,
        parsedName: data.parsedName || "Applicant Profile",
        parsedSkills: data.parsedSkills || [],
        targetRoles: data.targetRoles || [],
        preferredLocation: data.preferredLocation || 'Remote',
      });

      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 4000);
    } catch (err: any) {
      console.warn("Server parsing error. Using local fallback parser.", err);
      addAiLog("ResumeParser Warning: Server parsing failed. Executing standalone semantic text segment fallbacks...");
      // Fallback local key-word heuristic matching if server-side Gemini key is absent
      fallbackParser(resumeText);
    } finally {
      setIsParsing(false);
    }
  };

  const fallbackParser = (text: string) => {
    // Basic heuristic to avoid breaking if user hasn't input the Gemini API Key
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const name = lines[0]?.length < 50 ? lines[0] : "Applicant Profile";
    
    // Simple regex matching for common skills
    const popularSkills = [
      "React", "TypeScript", "JavaScript", "Python", "Tailwind CSS", "Next.js", "Node.js", "Express", 
      "D3", "AWS", "Git", "Docker", "Framer Motion", "Recharts", "SQL", "PostgreSQL", "C++", "Java",
      "HIPAA", "Epic EMR", "HL7", "Product Management"
    ];
    const foundSkills = popularSkills.filter(s => text.toLowerCase().includes(s.toLowerCase()));

    // Dynamic heuristic for roles
    const rolesSet = new Set<string>();
    const commonRoles = [
      "Software Engineer", "Frontend Architect", "AI Integrations", "Full Stack", "Data Analyst",
      "Product Manager", "Systems Architect", "Health IT Analyst", "DevOps", "Developer", "Designer", "Contractor"
    ];
    
    // Scan text lines for any lines that look like roles
    lines.forEach(line => {
      commonRoles.forEach(r => {
        if (line.toLowerCase().includes(r.toLowerCase()) && line.length < 60) {
          rolesSet.add(line);
        }
      });
    });

    const targetRoles = rolesSet.size > 0 ? Array.from(rolesSet).slice(0, 4) : [];

    addAiLog(`ResumeParser Fallback: Extracted name "${name}". Found matched skills from vocabulary: [${foundSkills.join(", ")}].`);

    onParseComplete({
      name,
      skills: foundSkills,
      roles: targetRoles,
      location: "Remote",
    });

    onChangeProfile({
      ...profile,
      rawText: text,
      parsedName: name,
      parsedSkills: foundSkills,
      targetRoles: targetRoles,
      preferredLocation: "Remote",
    });

    setSuccessMsg(true);
    setTimeout(() => setSuccessMsg(false), 4000);
  };

  return (
    <div className="sleek-card rounded-2xl border border-white/10 shadow-lg p-6 sm:p-8" id="resume-parser-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2 font-display">
            <FileText className="w-5 h-5 text-indigo-400" />
            Resume Profile
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Input copy/pasted resume details to configure parsing queries for the Job Search Agent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSampleResume}
            className="text-xs px-3.6 py-2 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 bg-slate-900/40 transition-colors cursor-pointer"
          >
            Load Resume
          </button>
        </div>
      </div>

      <div className="space-y-5 font-sans">
        {/* 🚀 Drag and drop document file upload */}
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`relative p-6 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
            dragActive 
              ? 'border-indigo-505 bg-indigo-950/25 ring-2 ring-indigo-550/10' 
              : 'border-white/10 bg-slate-900/40 hover:bg-slate-900/60 hover:border-white/15'
          }`}
          onClick={() => document.getElementById('resume-file-input')?.click()}
        >
          <input 
            type="file"
            id="resume-file-input"
            className="hidden"
            accept=".pdf,.txt,.md"
            onChange={handleFileInputChange}
          />
          <Upload className={`w-8 h-8 ${dragActive ? 'text-indigo-450 animate-bounce' : 'text-slate-400'} mb-2`} />
          <h4 className="text-xs font-semibold text-white font-display">
            Upload Document (PDF, TXT, MD)
          </h4>
          <p className="text-[10px] text-slate-450 mt-1 max-w-xs leading-normal font-sans text-slate-400">
            Drag & drop your document file here, or click to browse local folders.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 font-display">
            Resume / Professional Experience Text
          </label>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume or experience history here..."
            className="w-full h-44 px-4 py-3 rounded-xl border border-white/10 bg-slate-950 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-600 font-sans leading-relaxed resize-y"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 font-sans">
          <div className="text-xs text-slate-400">
            {profile.parsedName ? (
              <span className="flex items-center gap-1.5 text-emerald-450 font-semibold font-display">
                <Check className="w-4 h-4 text-emerald-400" /> Active Profile: {profile.parsedName}
              </span>
            ) : (
              <span className="text-slate-500 font-mono">Not parsed yet</span>
            )}
          </div>
          
          <button
            onClick={handleParse}
            disabled={isParsing || !resumeText.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-650 text-white font-semibold text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/10 cursor-pointer"
          >
            {isParsing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                AI Agent Parsing...
              </span>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-400" />
                Parse Resume
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {parseError && (
          <div className="p-3 bg-rose-950/40 text-xs text-rose-300 rounded-xl border border-rose-500/20 leading-relaxed font-mono">
            {parseError}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-950/45 text-xs text-emerald-300 rounded-xl border border-emerald-500/15 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" /> Customized parsing successful! Target filters and keywords configured below.
          </div>
        )}

        {profile.parsedSkills && profile.parsedSkills.length > 0 && (
          <div className="pt-4 border-t border-white/5 transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 font-display">Parsed Scope Metrics</span>
              <button
                onClick={() => setIsEditingTags(!isEditingTags)}
                className="text-xs text-slate-450 hover:text-white flex items-center gap-1 font-semibold"
              >
                <Edit2 className="w-3 h-3" /> {isEditingTags ? "Close Edit" : "Edit Details"}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1.5">Primary Target Roles:</span>
                {isEditingTags ? (
                  <input
                    type="text"
                    value={profile.targetRoles?.join(', ')}
                    onChange={(e) => onChangeProfile({
                      ...profile,
                      targetRoles: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-white/10 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Writers, React, Soft Engineer"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.targetRoles?.map((role, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-slate-900 border border-white/5 text-xs font-medium rounded-lg text-slate-300">
                        {role}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1.5">Core Technical Skills:</span>
                {isEditingTags ? (
                  <input
                    type="text"
                    value={profile.parsedSkills?.join(', ')}
                    onChange={(e) => onChangeProfile({
                      ...profile,
                      parsedSkills: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-white/10 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    placeholder="React, AWS, CSS"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.parsedSkills?.map((skill, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-slate-953 text-xs rounded-md text-slate-350 border border-white/5 font-mono">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1">Target Minimum Match Score: <strong className="text-indigo-400 font-mono">{profile.minMatchScore}%</strong></span>
                <input
                  type="range"
                  min="30"
                  max="90"
                  value={profile.minMatchScore}
                  onChange={(e) => onChangeProfile({ ...profile, minMatchScore: Number(e.target.value) })}
                  className="w-full accent-indigo-500 h-1.5 bg-slate-850 rounded-lg cursor-pointer mt-3"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
