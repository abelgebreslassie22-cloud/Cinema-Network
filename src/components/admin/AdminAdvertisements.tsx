import React, { useState, useEffect } from 'react';
import { 
  Megaphone, Plus, Search, Trash2, Copy, Edit3, Play, Pause, 
  Calendar, ArrowUpRight, UploadCloud, X, Layout, Activity, 
  Eye, MousePointerClick, Percent, TrendingUp, Settings, ChevronRight, Sparkles 
} from 'lucide-react';
import { Ad, CustomSlot, PREDEFINED_POSITIONS } from '../../utils/ads';
import AdPlaceholder from '../AdPlaceholder';
import { useData } from '../../context/DataContext';

export default function AdminAdvertisements() {
  const { 
    ads, 
    customSlots: slots, 
    addAdItem: addAd, 
    updateAdItem: updateAd, 
    deleteAdItem: deleteAd, 
    addSlotItem: addCustomSlot, 
    deleteSlotItem: deleteCustomSlot 
  } = useData();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPosition, setFilterPosition] = useState<string>('all');
  
  // Custom slot form state
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [slotName, setSlotName] = useState('');
  const [slotWidth, setSlotWidth] = useState(300);
  const [slotHeight, setSlotHeight] = useState(250);
  const [slotLocation, setSlotLocation] = useState('Sidebar');
  const [slotDescription, setSlotDescription] = useState('');
  const [slotRotation, setSlotRotation] = useState<'random' | 'round-robin' | 'weighted'>('weighted');

  // Ad Form state
  const [isEditing, setIsEditing] = useState<string | null>(null); // 'new' or specific ad ID
  const [adName, setAdName] = useState('');
  const [adType, setAdType] = useState<Ad['type']>('image-text');
  const [adPosition, setAdPosition] = useState('');
  const [adPriority, setAdPriority] = useState<Ad['priority']>('medium');
  const [adWeight, setAdWeight] = useState(50);
  const [adStartDate, setAdStartDate] = useState('');
  const [adEndDate, setAdEndDate] = useState('');
  const [adStatus, setAdStatus] = useState<Ad['status']>('active');
  const [adImgDesktop, setAdImgDesktop] = useState('');
  const [adImgTablet, setAdImgTablet] = useState('');
  const [adImgMobile, setAdImgMobile] = useState('');
  const [adHeadline, setAdHeadline] = useState('');
  const [adDesc, setAdDesc] = useState('');
  const [adBtnText, setAdBtnText] = useState('');
  const [adDestUrl, setAdDestUrl] = useState('');
  const [adCustomCode, setAdCustomCode] = useState('');
  const [adToDelete, setAdToDelete] = useState<string | null>(null);
  const [slotToDelete, setSlotToDelete] = useState<string | null>(null);

  // Drag and drop / local previews
  const [dragActive, setDragActive] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // Add custom slot
  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotName.trim()) return;

    const newSlot: CustomSlot = {
      id: `slot_${Date.now()}`,
      name: slotName,
      width: Number(slotWidth),
      height: Number(slotHeight),
      location: slotLocation,
      description: slotDescription,
      rotationStrategy: slotRotation
    };

    await addCustomSlot(newSlot);
    
    // Clear slot builder form
    setSlotName('');
    setSlotWidth(300);
    setSlotHeight(250);
    setSlotDescription('');
    setShowSlotModal(false);
  };

  // Delete custom slot
  const handleDeleteSlot = (id: string) => {
    setSlotToDelete(id);
  };

  const confirmDeleteSlot = async () => {
    if (slotToDelete) {
      await deleteCustomSlot(slotToDelete);
      setSlotToDelete(null);
    }
  };

  // File drop converter to Base64 (Drag and Drop Image upload support)
  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        if (previewDevice === 'mobile') {
          setAdImgMobile(reader.result);
        } else if (previewDevice === 'tablet') {
          setAdImgTablet(reader.result);
        } else {
          setAdImgDesktop(reader.result);
        }
      }
    };
    reader.readAsDataURL(file);
  };

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
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  // Create / Edit Ad Form Submission
  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adName.trim()) return;

    const adData: Ad = {
      id: isEditing === 'new' ? `ad_${Date.now()}` : isEditing!,
      name: adName,
      type: adType,
      position: adPosition || PREDEFINED_POSITIONS[0].id,
      priority: adPriority,
      weight: Number(adWeight),
      startDate: adStartDate || undefined,
      endDate: adEndDate || undefined,
      status: adStatus,
      imageUrlDesktop: adImgDesktop || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=1200&h=200',
      imageUrlTablet: adImgTablet || undefined,
      imageUrlMobile: adImgMobile || undefined,
      headline: adHeadline || undefined,
      description: adDesc || undefined,
      buttonText: adBtnText || undefined,
      destinationUrl: adDestUrl || undefined,
      customCode: adCustomCode || undefined,
      impressions: isEditing === 'new' ? 0 : ads.find(a => a.id === isEditing)?.impressions || 0,
      clicks: isEditing === 'new' ? 0 : ads.find(a => a.id === isEditing)?.clicks || 0,
      firstSeen: isEditing === 'new' ? undefined : ads.find(a => a.id === isEditing)?.firstSeen,
      lastSeen: isEditing === 'new' ? undefined : ads.find(a => a.id === isEditing)?.lastSeen,
      dailyStats: isEditing === 'new' ? {} : ads.find(a => a.id === isEditing)?.dailyStats || {}
    };

    if (isEditing === 'new') {
      await addAd(adData);
    } else {
      await updateAd(adData);
    }

    setIsEditing(null);
  };

  // Quick action: status change
  const handleToggleStatus = async (id: string, newStatus: Ad['status']) => {
    const existing = ads.find(ad => ad.id === id);
    if (existing) {
      await updateAd({ ...existing, status: newStatus });
    }
  };

  // Quick action: duplicate ad
  const handleDuplicateAd = async (ad: Ad) => {
    const duplicated: Ad = {
      ...ad,
      id: `ad_${Date.now()}`,
      name: `${ad.name} (Copy)`,
      impressions: 0,
      clicks: 0,
      dailyStats: {},
      firstSeen: undefined,
      lastSeen: undefined
    };
    await addAd(duplicated);
  };

  // Quick action: delete ad
  const handleDeleteAd = (id: string) => {
    setAdToDelete(id);
  };

  const confirmDeleteAd = async () => {
    if (adToDelete) {
      await deleteAd(adToDelete);
      setAdToDelete(null);
    }
  };


  // Open Form for creation / editing
  const handleOpenForm = (ad?: Ad) => {
    if (ad) {
      setIsEditing(ad.id);
      setAdName(ad.name);
      setAdType(ad.type);
      setAdPosition(ad.position);
      setAdPriority(ad.priority);
      setAdWeight(ad.weight);
      setAdStartDate(ad.startDate || '');
      setAdEndDate(ad.endDate || '');
      setAdStatus(ad.status);
      setAdImgDesktop(ad.imageUrlDesktop);
      setAdImgTablet(ad.imageUrlTablet || '');
      setAdImgMobile(ad.imageUrlMobile || '');
      setAdHeadline(ad.headline || '');
      setAdDesc(ad.description || '');
      setAdBtnText(ad.buttonText || '');
      setAdDestUrl(ad.destinationUrl || '');
      setAdCustomCode(ad.customCode || '');
    } else {
      setIsEditing('new');
      setAdName('');
      setAdType('image-text');
      setAdPosition(PREDEFINED_POSITIONS[0].id);
      setAdPriority('medium');
      setAdWeight(50);
      setAdStartDate('');
      setAdEndDate('');
      setAdStatus('active');
      setAdImgDesktop('');
      setAdImgTablet('');
      setAdImgMobile('');
      setAdHeadline('');
      setAdDesc('');
      setAdBtnText('');
      setAdDestUrl('');
      setAdCustomCode('');
    }
  };

  // Calculated Stats
  const totalAds = ads.length;
  const activeAdsCount = ads.filter(a => a.status === 'active').length;
  const inactiveAdsCount = ads.filter(a => a.status === 'inactive' || a.status === 'paused').length;
  const totalImpressions = ads.reduce((sum, a) => sum + a.impressions, 0);
  const totalClicks = ads.reduce((sum, a) => sum + a.clicks, 0);
  const averageCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

  // Sort and filter ads
  const filteredAds = ads.filter(ad => {
    const matchesSearch = ad.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (ad.headline && ad.headline.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = filterType === 'all' || ad.type === filterType;
    const matchesStatus = filterStatus === 'all' || ad.status === filterStatus;
    const matchesPosition = filterPosition === 'all' || ad.position === filterPosition;
    return matchesSearch && matchesType && matchesStatus && matchesPosition;
  });

  const topPerformingAds = [...ads].sort((a, b) => {
    const ctrA = a.impressions > 0 ? a.clicks / a.impressions : 0;
    const ctrB = b.impressions > 0 ? b.clicks / b.impressions : 0;
    return ctrB - ctrA;
  });

  // Re-build standard analytics lists
  const positionsDropdown = [
    ...PREDEFINED_POSITIONS,
    ...slots.map(s => ({ id: s.id, label: `Custom: ${s.name} (${s.width}x${s.height})`, type: s.location }))
  ];

  return (
    <div className="space-y-8">
      
      {/* Overview Analytics Dashboard */}
      {isEditing === null && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="glass-card p-5 rounded-2xl border border-white/5 flex items-center justify-between relative overflow-hidden">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Total Campaigns</span>
              <h3 className="text-3xl font-poppins font-black text-white">{totalAds}</h3>
              <div className="flex items-center gap-1 text-[10px] text-green-400">
                <Sparkles className="w-3 h-3" />
                <span>{activeAdsCount} Active</span>
              </div>
            </div>
            <div className="p-4 bg-brand-primary/10 text-brand-primary rounded-xl">
              <Megaphone className="w-6 h-6" />
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl border border-white/5 flex items-center justify-between relative overflow-hidden">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Total Impressions</span>
              <h3 className="text-3xl font-poppins font-black text-white">{totalImpressions.toLocaleString()}</h3>
              <div className="flex items-center gap-1 text-[10px] text-white/50">
                <span>Across all placements</span>
              </div>
            </div>
            <div className="p-4 bg-blue-500/10 text-blue-400 rounded-xl">
              <Eye className="w-6 h-6" />
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl border border-white/5 flex items-center justify-between relative overflow-hidden">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Total Clicks</span>
              <h3 className="text-3xl font-poppins font-black text-white">{totalClicks.toLocaleString()}</h3>
              <div className="flex items-center gap-1 text-[10px] text-green-400">
                <TrendingUp className="w-3 h-3" />
                <span>Steady conversion rates</span>
              </div>
            </div>
            <div className="p-4 bg-purple-500/10 text-purple-400 rounded-xl">
              <MousePointerClick className="w-6 h-6" />
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl border border-white/5 flex items-center justify-between relative overflow-hidden">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Average CTR</span>
              <h3 className="text-3xl font-poppins font-black text-white">{averageCTR}%</h3>
              <div className="flex items-center gap-1 text-[10px] text-brand-secondary">
                <span>Clicks / Impressions</span>
              </div>
            </div>
            <div className="p-4 bg-yellow-500/10 text-brand-secondary rounded-xl">
              <Percent className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Main Campaign Builder Form */}
      {isEditing !== null ? (
        <div className="glass-card rounded-2xl border border-white/5 p-6 md:p-8">
          <div className="flex items-center justify-between border-b border-white/10 pb-5 mb-6">
            <div>
              <h2 className="text-2xl font-poppins font-bold text-white flex items-center gap-2">
                <Megaphone className="w-6 h-6 text-brand-primary" />
                {isEditing === 'new' ? 'Create Advertisement' : `Edit Campaign: ${adName}`}
              </h2>
              <p className="text-sm text-brand-muted mt-1">Configure type, scheduling, targeting, and live-preview creative dimensions.</p>
            </div>
            <button 
              onClick={() => setIsEditing(null)}
              className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form Fields */}
            <form onSubmit={handleSaveAd} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/80">Advertisement Name</label>
                  <input 
                    type="text"
                    required
                    placeholder="E.g. Summer Premium Promo"
                    value={adName}
                    onChange={(e) => setAdName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/80">Advertisement Type</label>
                  <select
                    value={adType}
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      setAdType(newType);
                      if (newType === 'popunder') {
                        setAdPosition('popunder_click_redirect');
                      } else if (newType === 'floating') {
                        setAdPosition('floating_overlay_ad');
                      }
                    }}
                    className="w-full bg-[#1A2238] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  >
                    <option value="image-text">Image + Text Banner</option>
                    <option value="image">Pure Image Banner</option>
                    <option value="html">Raw HTML Code</option>
                    <option value="javascript">Custom JavaScript Code</option>
                    <option value="iframe">Iframe Redirect URL</option>
                    <option value="network">External Ad Network Code</option>
                    <option value="popunder">Pop-up Redirect (Any Click)</option>
                    <option value="floating">Floating Overlay (Close Button)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/80">Placement Slot</label>
                  <select
                    value={adPosition}
                    onChange={(e) => setAdPosition(e.target.value)}
                    className="w-full bg-[#1A2238] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  >
                    {positionsDropdown.map(pos => (
                      <option key={pos.id} value={pos.id}>{pos.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/80">Priority Level</label>
                  <select
                    value={adPriority}
                    onChange={(e) => setAdPriority(e.target.value as any)}
                    className="w-full bg-[#1A2238] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  >
                    <option value="high">High (Priority rotation)</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/80 flex justify-between">
                    <span>Rotation Weight</span>
                    <span className="text-brand-primary font-bold">{adWeight}%</span>
                  </label>
                  <input 
                    type="range"
                    min="1"
                    max="100"
                    value={adWeight}
                    onChange={(e) => setAdWeight(Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/80 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Start Date (Optional)
                  </label>
                  <input 
                    type="date"
                    value={adStartDate}
                    onChange={(e) => setAdStartDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/80 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> End Date (Optional)
                  </label>
                  <input 
                    type="date"
                    value={adEndDate}
                    onChange={(e) => setAdEndDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/80">Status</label>
                  <select
                    value={adStatus}
                    onChange={(e) => setAdStatus(e.target.value as any)}
                    className="w-full bg-[#1A2238] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  >
                    <option value="active">Active (Visible)</option>
                    <option value="inactive">Inactive</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>

              {/* IMAGE INPUTS */}
              {(adType === 'image' || adType === 'image-text' || adType === 'floating') && (
                <div className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/5">
                  <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wide">Device Creatives & Upload</h4>
                  
                  {/* Drag and Drop Container */}
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                      dragActive ? 'border-brand-primary bg-brand-primary/5 scale-98' : 'border-white/10 hover:border-white/25 bg-black/20'
                    }`}
                  >
                    <input 
                      type="file" 
                      id="ad-img-file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => e.target.files && handleImageFile(e.target.files[0])}
                    />
                    <label htmlFor="ad-img-file" className="cursor-pointer flex flex-col items-center gap-2">
                      <UploadCloud className="w-10 h-10 text-brand-muted/70 group-hover:text-white transition-colors" />
                      <span className="text-xs font-semibold text-white">Drag & drop ad asset here, or <span className="text-brand-primary underline">browse</span></span>
                      <span className="text-[10px] text-brand-muted">Targeting device: <span className="text-white font-bold capitalize">{previewDevice}</span></span>
                    </label>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-brand-muted">Desktop Image URL</label>
                      <input 
                        type="text"
                        placeholder="Desktop dimension link (E.g. 1200x200 or 300x600)"
                        value={adImgDesktop}
                        onChange={(e) => setAdImgDesktop(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted">Tablet Image (Optional)</label>
                        <input 
                          type="text"
                          placeholder="Tablet link"
                          value={adImgTablet}
                          onChange={(e) => setAdImgTablet(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-brand-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted">Mobile Image (Optional)</label>
                        <input 
                          type="text"
                          placeholder="Mobile link"
                          value={adImgMobile}
                          onChange={(e) => setAdImgMobile(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-brand-primary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* IMAGE + TEXT INPUTS */}
              {(adType === 'image-text' || adType === 'floating') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/80">Headline</label>
                    <input 
                      type="text"
                      placeholder="Sponsored title"
                      value={adHeadline}
                      onChange={(e) => setAdHeadline(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/80">Description</label>
                    <input 
                      type="text"
                      placeholder="Enter details promoting content..."
                      value={adDesc}
                      onChange={(e) => setAdDesc(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/80">Button Text</label>
                    <input 
                      type="text"
                      placeholder="E.g. Visit Channel"
                      value={adBtnText}
                      onChange={(e) => setAdBtnText(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/80">Destination Link</label>
                    <input 
                      type="text"
                      placeholder="E.g. https://telegram.me/CinemaBot"
                      value={adDestUrl}
                      onChange={(e) => setAdDestUrl(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                </div>
              )}

              {/* POP-UP / POPUNDER INPUTS */}
              {adType === 'popunder' && (
                <div className="space-y-2 bg-white/5 p-4 rounded-xl border border-white/5">
                  <label className="text-xs font-semibold text-white/80">Pop-up Target URL (Redirect link)</label>
                  <input 
                    type="text"
                    required
                    placeholder="Enter redirect URL (e.g., https://example.com)"
                    value={adDestUrl}
                    onChange={(e) => setAdDestUrl(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  />
                  <p className="text-[10px] text-brand-muted mt-1">
                    When active, clicking ANY button, link, or card on the site (outside of Admin panel) will open this target URL in a new window/tab as a popup/popunder.
                  </p>
                </div>
              )}

              {/* CUSTOM CODE INPUTS (HTML, Javascript, Network code) */}
              {(adType === 'html' || adType === 'javascript' || adType === 'network' || adType === 'iframe') && (
                <div className="space-y-2 bg-white/5 p-4 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-white/80">Custom Ad Code / Embed URL</label>
                    <span className="text-[10px] text-brand-secondary font-mono">Pasted codes execute in a secure sandbox</span>
                  </div>
                  <textarea
                    rows={6}
                    placeholder={
                      adType === 'iframe' 
                        ? 'Paste the direct redirect landing URL or HTML embedded elements' 
                        : adType === 'network' 
                        ? 'Paste complete network tag (AdSense script, Adsterra popunder code, propellerads tag, etc.)'
                        : `Paste raw code tags directly (E.g. ${adType === 'javascript' ? '<script>console.log("running ad")</script>' : '<div class="custom-promo">Custom</div>'})`
                    }
                    value={adCustomCode}
                    onChange={(e) => setAdCustomCode(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 font-mono text-xs text-brand-secondary focus:outline-none focus:border-brand-primary"
                  />
                  {adType === 'iframe' && (
                    <div className="space-y-2 mt-2">
                      <label className="text-xs font-semibold text-white/80">Iframe Target URL</label>
                      <input 
                        type="text"
                        placeholder="Iframe destination redirect (https://example.com)"
                        value={adDestUrl}
                        onChange={(e) => setAdDestUrl(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-4 pt-4 border-t border-white/10">
                <button
                  type="submit"
                  className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(255,107,0,0.3)]"
                >
                  Save Advertisement Campaign
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(null)}
                  className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold py-2.5 px-4 rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>

            {/* Live Interactive Preview Panel */}
            <div className="space-y-5 bg-black/40 p-6 rounded-2xl border border-white/5 self-start">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="font-poppins font-semibold text-white flex items-center gap-1.5 text-sm sm:text-base">
                  <Activity className="w-4 h-4 text-brand-primary" /> Live Responsive Preview
                </h3>
                <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5">
                  {['desktop', 'tablet', 'mobile'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setPreviewDevice(d as any)}
                      className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded transition-colors ${
                        previewDevice === d ? 'bg-brand-primary text-white' : 'text-brand-muted hover:text-white'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real Render Container */}
              <div className="relative border border-white/10 p-3 rounded-xl bg-brand-bg/50 overflow-hidden flex items-center justify-center">
                <AdPlaceholder 
                  position={adPosition || 'homepage_search_banner'} 
                  className="w-full"
                  previewAd={{
                    id: 'temp_preview',
                    name: adName || 'Preview Banner Campaign',
                    type: adType,
                    position: adPosition,
                    priority: adPriority,
                    weight: adWeight,
                    status: 'active',
                    imageUrlDesktop: adImgDesktop || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=1200&h=200',
                    imageUrlTablet: adImgTablet || undefined,
                    imageUrlMobile: adImgMobile || undefined,
                    headline: adHeadline || 'Sample Sponsored Title Here',
                    description: adDesc || 'Sample promo paragraph details displayed dynamically to prospective users in live slots.',
                    buttonText: adBtnText || 'Join Premium Bot',
                    destinationUrl: adDestUrl || '#',
                    customCode: adCustomCode,
                    impressions: 0,
                    clicks: 0
                  }}
                />
              </div>

              {/* Layout details */}
              <div className="text-[11px] text-brand-muted space-y-1 font-mono">
                <div>Position: <span className="text-white font-bold">{adPosition || 'homepage_search_banner'}</span></div>
                <div>Rotation strategy: <span className="text-brand-primary uppercase font-bold">Weighted ({adWeight}%)</span></div>
                <div>Responsive size: <span className="text-white">{previewDevice === 'desktop' ? '1200px+' : previewDevice === 'tablet' ? '768px-1024px' : '320px-640px'}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Top Custom Slots Section and Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Megaphone className="w-6 h-6 text-brand-primary" />
              <div>
                <h2 className="text-xl font-poppins font-bold text-white">Ad Campaigns & Custom Slots</h2>
                <p className="text-xs text-brand-muted">Control all dynamic banner spaces, custom integrations, AdSense tags, and rotational weights.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSlotModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-brand-primary/30 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary text-xs font-bold rounded-xl transition-all"
              >
                <Layout className="w-4 h-4" /> Custom Slot Builder
              </button>
              <button
                onClick={() => handleOpenForm()}
                className="flex items-center gap-1.5 px-4 py-2 bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold rounded-xl transition-all shadow-md"
              >
                <Plus className="w-4 h-4" /> Create Advertisement
              </button>
            </div>
          </div>

          {/* Search, Filter bars */}
          <div className="glass-card p-4 rounded-xl border border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <input 
                type="text"
                placeholder="Search active campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-[#1A2238] border border-white/10 rounded-lg py-1 px-2.5 text-xs text-white focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="image-text">Image + Text</option>
                <option value="image">Pure Image</option>
                <option value="html">Raw HTML</option>
                <option value="javascript">JavaScript</option>
                <option value="iframe">Iframe Link</option>
                <option value="network">External Ad Network</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-[#1A2238] border border-white/10 rounded-lg py-1 px-2.5 text-xs text-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
                <option value="paused">Paused Only</option>
              </select>

              <select
                value={filterPosition}
                onChange={(e) => setFilterPosition(e.target.value)}
                className="bg-[#1A2238] border border-white/10 rounded-lg py-1 px-2.5 text-xs text-white focus:outline-none"
              >
                <option value="all">All Positions</option>
                {positionsDropdown.map(pos => (
                  <option key={pos.id} value={pos.id}>{pos.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Campaigns List Table */}
          <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/5">
              <h3 className="font-poppins font-bold text-white text-base">Campaign Catalog ({filteredAds.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-brand-muted">
                <thead className="bg-white/5 text-white/70 uppercase">
                  <tr>
                    <th className="px-6 py-3">Ad Info / Preview</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Slot Position</th>
                    <th className="px-6 py-3">Rotations</th>
                    <th className="px-6 py-3">Analytics (Imp / Clk / CTR)</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAds.map(ad => {
                    const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0.00';
                    const isScheduleActive = ad.status === 'active' && (!ad.startDate || new Date() >= new Date(ad.startDate)) && (!ad.endDate || new Date() <= new Date(ad.endDate));

                    return (
                      <tr key={ad.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-16 h-10 overflow-hidden rounded bg-black/40 border border-white/5 shrink-0 flex items-center justify-center">
                              {ad.imageUrlDesktop ? (
                                <img src={ad.imageUrlDesktop} alt={ad.name} className="w-full h-full object-cover" />
                              ) : (
                                <Megaphone className="w-4 h-4 text-brand-muted" />
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-white text-sm">{ad.name}</div>
                              {ad.startDate || ad.endDate ? (
                                <div className="text-[10px] text-brand-muted flex items-center gap-1 mt-0.5">
                                  <Calendar className="w-3 h-3 text-brand-primary" />
                                  <span>
                                    {ad.startDate || 'Anytime'} to {ad.endDate || 'Unlimited'}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-green-400 font-bold mt-0.5">Continuous Campaign</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-white/10 px-2 py-0.5 rounded font-mono text-[10px] uppercase text-white/90">
                            {ad.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-white max-w-[150px] truncate">
                          {positionsDropdown.find(p => p.id === ad.position)?.label || ad.position}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5 text-[11px]">
                            <div>Weight: <span className="text-white font-bold">{ad.weight}%</span></div>
                            <div>Priority: <span className="text-brand-secondary capitalize">{ad.priority}</span></div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="text-white font-bold">{ad.impressions.toLocaleString()}</div>
                              <div className="text-[10px] text-brand-muted">Impressions</div>
                            </div>
                            <div className="border-l border-white/10 pl-3">
                              <div className="text-white font-bold">{ad.clicks.toLocaleString()}</div>
                              <div className="text-[10px] text-brand-muted">Clicks</div>
                            </div>
                            <div className="border-l border-white/10 pl-3">
                              <div className="text-brand-primary font-black">{ctr}%</div>
                              <div className="text-[10px] text-brand-muted">CTR</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] px-2 py-1 rounded-full font-bold flex items-center w-fit gap-1 ${
                            isScheduleActive ? 'bg-green-500/20 text-green-400' :
                            ad.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {isScheduleActive ? <Play className="w-2.5 h-2.5 fill-current" /> : <Pause className="w-2.5 h-2.5 fill-current" />}
                            {isScheduleActive ? 'Live Active' : ad.status === 'paused' ? 'Paused' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {ad.status === 'active' ? (
                              <button 
                                onClick={() => handleToggleStatus(ad.id, 'paused')}
                                className="p-1.5 hover:bg-yellow-500/10 text-brand-muted hover:text-yellow-400 rounded transition-colors"
                                title="Pause Campaign"
                              >
                                <Pause className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleToggleStatus(ad.id, 'active')}
                                className="p-1.5 hover:bg-green-500/10 text-brand-muted hover:text-green-400 rounded transition-colors"
                                title="Resume Campaign"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button 
                              onClick={() => handleOpenForm(ad)}
                              className="p-1.5 hover:bg-blue-500/10 text-brand-muted hover:text-blue-400 rounded transition-colors"
                              title="Edit Campaign"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDuplicateAd(ad)}
                              className="p-1.5 hover:bg-purple-500/10 text-brand-muted hover:text-purple-400 rounded transition-colors"
                              title="Duplicate Campaign"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDeleteAd(ad.id)}
                              className="p-1.5 hover:bg-red-500/10 text-brand-muted hover:text-red-500 rounded transition-colors"
                              title="Delete Campaign"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAds.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-brand-muted">
                        No advertisement campaigns match the selected filters. Click "Create Advertisement" to add your first campaign!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Dual Grid - Top Performing Ads + Custom Slots Config */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Top Performing Ads */}
            <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-5 border-b border-white/5 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-brand-primary" />
                <h3 className="font-poppins font-bold text-white text-base">Top Performing Ads (by CTR)</h3>
              </div>
              <div className="p-4 space-y-4">
                {topPerformingAds.slice(0, 5).map((ad, idx) => {
                  const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0.00';
                  return (
                    <div key={ad.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-brand-muted w-4">#{idx+1}</span>
                        <div className="min-w-0">
                          <h4 className="font-bold text-white text-sm truncate">{ad.name}</h4>
                          <span className="text-[10px] text-brand-muted font-mono">{positionsDropdown.find(p => p.id === ad.position)?.label || ad.position}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right shrink-0">
                        <div className="text-[11px] font-mono">
                          <div className="text-brand-primary font-bold">{ctr}% CTR</div>
                          <div className="text-brand-muted text-[9px]">{ad.clicks} Clicks</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-brand-muted" />
                      </div>
                    </div>
                  );
                })}
                {topPerformingAds.length === 0 && (
                  <div className="text-center py-8 text-brand-muted">No statistics recorded yet.</div>
                )}
              </div>
            </div>

            {/* Custom Registered Placements Slots */}
            <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layout className="w-5 h-5 text-brand-secondary" />
                  <h3 className="font-poppins font-bold text-white text-base">Custom Slot Placements ({slots.length})</h3>
                </div>
                <button 
                  onClick={() => setShowSlotModal(true)}
                  className="text-xs font-bold text-brand-primary hover:underline"
                >
                  + Create Slot
                </button>
              </div>
              <div className="p-4 space-y-4">
                {slots.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                    <div>
                      <h4 className="font-bold text-white text-sm">{s.name}</h4>
                      <p className="text-[10px] text-brand-muted">{s.description || 'No description'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="bg-brand-bg text-[10px] px-1.5 py-0.5 rounded text-white/80 border border-white/5 font-mono">
                          {s.width}x{s.height}
                        </span>
                        <span className="bg-brand-bg text-[10px] px-1.5 py-0.5 rounded text-brand-secondary border border-white/5 capitalize">
                          {s.rotationStrategy} Rotation
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSlot(s.id)}
                      className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                      title="Delete Slot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {slots.length === 0 && (
                  <div className="text-center py-8 text-brand-muted flex flex-col items-center gap-2">
                    <span>No custom ad slots created yet.</span>
                    <button 
                      onClick={() => setShowSlotModal(true)}
                      className="text-xs bg-white/5 border border-white/10 rounded-lg py-1 px-3 hover:bg-white/10 text-white font-bold"
                    >
                      Create first slot
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* CUSTOM SLOT BUILDER MODAL */}
      {showSlotModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form 
            onSubmit={handleAddSlot}
            className="bg-[#151B2D] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
              <h3 className="text-lg font-poppins font-bold text-white flex items-center gap-2">
                <Layout className="w-5 h-5 text-brand-primary" /> Create Custom Placement Slot
              </h3>
              <button 
                type="button" 
                onClick={() => setShowSlotModal(false)}
                className="text-brand-muted hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/80">Slot Placement Name</label>
                <input 
                  type="text"
                  required
                  placeholder="E.g. Anime Sidebar Square"
                  value={slotName}
                  onChange={(e) => setSlotName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/80">Target Width (px)</label>
                  <input 
                    type="number"
                    required
                    placeholder="300"
                    value={slotWidth}
                    onChange={(e) => setSlotWidth(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/80">Target Height (px)</label>
                  <input 
                    type="number"
                    required
                    placeholder="250"
                    value={slotHeight}
                    onChange={(e) => setSlotHeight(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/80">Page Section Location</label>
                  <select
                    value={slotLocation}
                    onChange={(e) => setSlotLocation(e.target.value)}
                    className="w-full bg-[#1A2238] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  >
                    <option value="Banner">Top / Bottom Banner</option>
                    <option value="Sidebar">Sidebar Column</option>
                    <option value="In-Feed">Inline List Grid</option>
                    <option value="Footer">Footer Row</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/80">Rotation Strategy</label>
                  <select
                    value={slotRotation}
                    onChange={(e) => setSlotRotation(e.target.value as any)}
                    className="w-full bg-[#1A2238] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                  >
                    <option value="weighted">Weighted Rotation</option>
                    <option value="round-robin">Round Robin Series</option>
                    <option value="random">Pure Randomize</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/80">Description</label>
                <textarea
                  rows={2}
                  placeholder="Where is this ad displayed on the platform..."
                  value={slotDescription}
                  onChange={(e) => setSlotDescription(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 border-t border-white/5 pt-4">
              <button
                type="button"
                onClick={() => setShowSlotModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary/90 transition-colors shadow-md"
              >
                Save Custom Slot
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Ad Confirmation Modal */}
      {adToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#151B2D] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
             <div className="flex items-center gap-3 text-red-500 mb-4">
               <div className="p-2 bg-red-500/10 rounded-full">
                 <Trash2 className="w-6 h-6" />
               </div>
               <h3 className="text-xl font-poppins font-bold">Delete Campaign</h3>
             </div>
             <p className="text-white/80 mb-6">Are you sure you want to permanently delete this advertisement campaign?</p>
             <div className="flex items-center justify-end gap-3">
               <button
                 onClick={() => setAdToDelete(null)}
                 className="px-4 py-2 rounded-lg font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors text-xs"
               >
                 Cancel
               </button>
               <button
                 onClick={confirmDeleteAd}
                 className="px-4 py-2 rounded-lg font-bold bg-red-500 hover:bg-red-600 text-white transition-colors text-xs"
               >
                 Delete
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Delete Slot Confirmation Modal */}
      {slotToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#151B2D] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
             <div className="flex items-center gap-3 text-red-500 mb-4">
               <div className="p-2 bg-red-500/10 rounded-full">
                 <Trash2 className="w-6 h-6" />
               </div>
               <h3 className="text-xl font-poppins font-bold">Delete Custom Slot</h3>
             </div>
             <p className="text-white/80 mb-6">Are you sure you want to delete this custom slot? Existing ads in this slot will default to standard behaviors.</p>
             <div className="flex items-center justify-end gap-3">
               <button
                 onClick={() => setSlotToDelete(null)}
                 className="px-4 py-2 rounded-lg font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors text-xs"
               >
                 Cancel
               </button>
               <button
                 onClick={confirmDeleteSlot}
                 className="px-4 py-2 rounded-lg font-bold bg-red-500 hover:bg-red-600 text-white transition-colors text-xs"
               >
                 Delete
               </button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
