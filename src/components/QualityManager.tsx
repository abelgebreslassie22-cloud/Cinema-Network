import { useState } from 'react';
import { QualityConfig, QualityVersion } from '../types';
import { Plus, Trash2, Link as LinkIcon, Settings2 } from 'lucide-react';

interface QualityManagerProps {
  qualities: Record<string, QualityConfig>;
  onChange: (qualities: Record<string, QualityConfig>) => void;
  seasonIndex?: number;
  seasonNumber?: number;
}

const AVAILABLE_QUALITIES = ['360P', '480P', '720P', '1080P', '2K', '4K'];

export default function QualityManager({ qualities, onChange, seasonIndex, seasonNumber }: QualityManagerProps) {
  const sIdx = seasonIndex !== undefined ? seasonIndex : (seasonNumber !== undefined ? seasonNumber - 1 : undefined);

  const handleToggleQuality = (qName: string) => {
    const next = { ...qualities };
    if (!next[qName]) {
      next[qName] = { enabled: true, versions: [{ id: Date.now().toString(), name: 'Default', link: '', size: '', sub: false }] };
    } else {
      const isNowEnabled = !next[qName].enabled;
      const versions = isNowEnabled && next[qName].versions.length === 0 
        ? [{ id: Date.now().toString(), name: 'Default', link: '', size: '', sub: false }]
        : next[qName].versions;
      next[qName] = { ...next[qName], enabled: isNowEnabled, versions };
    }
    onChange(next);
  };

  const handleAddVersion = (qName: string) => {
    const next = { ...qualities };
    if (!next[qName]) {
      next[qName] = { enabled: true, versions: [] };
    }
    next[qName] = {
      ...next[qName],
      enabled: true,
      versions: [...(next[qName].versions || []), { id: Date.now().toString(), name: '', link: '', size: '', sub: false }]
    };
    onChange(next);
  };

  const handleAddEpisodeVersionForSeason = () => {
    const next = { ...qualities };
    const enabledQualities = AVAILABLE_QUALITIES.filter(q => next[q]?.enabled);
    let targetQuality = enabledQualities.length > 0 ? enabledQualities[enabledQualities.length - 1] : '1080P';
    if (!next[targetQuality]) {
      next[targetQuality] = { enabled: true, versions: [] };
    } else {
      next[targetQuality] = { ...next[targetQuality], enabled: true };
    }
    next[targetQuality].versions = [
      ...next[targetQuality].versions,
      { id: Date.now().toString(), name: '', link: '', size: '', sub: false }
    ];
    onChange(next);
  };

  const handleRemoveVersion = (qName: string, id: string) => {
    const next = { ...qualities };
    next[qName] = {
      ...next[qName],
      versions: next[qName].versions.filter(v => v.id !== id)
    };
    onChange(next);
  };

  const handleVersionChange = (qName: string, id: string, field: keyof QualityVersion, value: any) => {
    const next = { ...qualities };
    next[qName] = {
      ...next[qName],
      versions: next[qName].versions.map(v => v.id === id ? { ...v, [field]: value } : v)
    };
    onChange(next);
  };

  let cumulativeSeasonEpIndex = 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          {AVAILABLE_QUALITIES.map(q => {
             const isOn = !!qualities[q]?.enabled;
             const testId = sIdx !== undefined ? `toggle-${sIdx}-${q}` : `toggle-${q}`;
             return (
               <div key={q} className="flex items-center gap-3 glass bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
                 <span className="font-semibold text-white">{q}</span>
                 <button
                   type="button"
                   data-testid={testId}
                   aria-checked={isOn ? "true" : "false"}
                   onClick={() => handleToggleQuality(q)}
                   className={`w-12 h-6 rounded-full transition-colors relative flex items-center ${isOn ? 'bg-brand-primary' : 'bg-gray-600'}`}
                 >
                   <span className={`w-4 h-4 bg-white rounded-full absolute transition-transform ${isOn ? 'translate-x-7' : 'translate-x-1'}`} />
                 </button>
               </div>
             );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {AVAILABLE_QUALITIES.map(q => {
           if (!qualities[q]?.enabled) return null;
           const versions = qualities[q].versions || [];
           return (
             <div key={q} className="glass-card p-4 rounded-xl border border-white/10 bg-black/20 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                   <h3 className="text-lg font-bold text-brand-primary flex items-center gap-2">
                     <Settings2 className="w-5 h-5" /> {q} Configuration
                   </h3>
                   <button
                     type="button"
                     data-testid={sIdx !== undefined ? `btn-add-version-${sIdx}-${q}` : `btn-add-version-${q}`}
                     onClick={() => handleAddVersion(q)}
                     className="text-xs font-semibold flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded transition-all"
                   >
                     <Plus className="w-3 h-3" /> Add Version
                   </button>
                </div>
                
                <div className="space-y-3">
                   {versions.map((v, i) => {
                      const nameTestId = sIdx !== undefined ? `input-name-${sIdx}-${q}-${i}` : `input-name-${q}-${i}`;
                      const sizeTestId = sIdx !== undefined ? `input-size-${sIdx}-${q}-${i}` : `input-size-${q}-${i}`;
                      const subTestId = sIdx !== undefined ? `toggle-sub-${sIdx}-${q}-${i}` : `toggle-sub-${q}-${i}`;
                      const linkTestId = sIdx !== undefined ? `input-link-${sIdx}-${q}-${i}` : `input-link-${q}-${i}`;

                      return (
                        <div key={v.id} className="flex items-start gap-4 p-3 bg-white/5 rounded-lg border border-white/5">
                           <div className="flex-1 space-y-3">
                              <div>
                                 <label className="text-xs font-medium text-brand-muted uppercase mb-1 block">Version Name</label>
                                 <input
                                   type="text"
                                   value={v.name}
                                   data-testid={nameTestId}
                                   onChange={e => handleVersionChange(q, v.id, 'name', e.target.value)}
                                   placeholder="e.g. H.265 10bit"
                                   className="w-full glass bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-primary transition-all"
                                 />
                              </div>
                              <div>
                                 <label className="text-xs font-medium text-brand-muted uppercase mb-1 block">Size</label>
                                 <input
                                   type="text"
                                   value={v.size || ''}
                                   data-testid={sizeTestId}
                                   onChange={e => handleVersionChange(q, v.id, 'size', e.target.value)}
                                   placeholder="e.g. 1.4 GB"
                                   className="w-full glass bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-primary transition-all"
                                 />
                              </div>
                              <div>
                                 <label className="text-xs font-medium text-brand-muted uppercase mb-1 block">Subtitle (Sub)</label>
                                 <button
                                   type="button"
                                   data-testid={subTestId}
                                   aria-checked={v.sub ? "true" : "false"}
                                   onClick={() => handleVersionChange(q, v.id, 'sub', !v.sub)}
                                   className={`w-full flex items-center justify-between glass bg-white/5 border rounded-lg px-3 py-2 text-sm transition-all text-left ${
                                     v.sub 
                                       ? 'border-[#00E5BC]/30 text-[#00E5BC] bg-[#0E2E2A]/30 font-bold' 
                                       : 'border-white/10 text-brand-muted hover:text-white'
                                   }`}
                                 >
                                   <span>Subtitle Available</span>
                                   <div className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ${v.sub ? 'bg-[#00E5BC]' : 'bg-gray-600'}`}>
                                     <div className={`w-3 h-3 bg-white rounded-full transition-transform duration-200 ${v.sub ? 'translate-x-4' : 'translate-x-0'}`} />
                                   </div>
                                 </button>
                              </div>
                              <div>
                                 <label className="text-xs font-medium text-brand-muted uppercase mb-1 block">Telegram Link</label>
                                 <div className="flex relative">
                                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                                    <input
                                      type="text"
                                      value={v.link}
                                      data-testid={linkTestId}
                                      onChange={e => handleVersionChange(q, v.id, 'link', e.target.value)}
                                      placeholder="https://t.me/..."
                                      className="w-full glass bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-brand-primary transition-all"
                                    />
                                 </div>
                              </div>
                           </div>
                           <button
                             type="button"
                             onClick={() => handleRemoveVersion(q, v.id)}
                             className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-500/20 rounded-lg transition-colors mt-6"
                           >
                              <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      );
                   })}
                    {versions.length === 0 && (
                       <p className="text-sm text-brand-muted italic py-2">No versions added yet. Click "Add Version" to configure links.</p>
                    )}
                 </div>
              </div>
           );
        })}
      </div>
    </div>
  );
}
