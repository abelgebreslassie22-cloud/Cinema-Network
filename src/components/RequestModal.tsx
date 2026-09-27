import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Heart, ChevronDown } from 'lucide-react';

interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RequestModal({ isOpen, onClose }: RequestModalProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Movie');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isOpenSelect, setIsOpenSelect] = useState(false);
  const categories = ['Movie', 'Series', 'Anime'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await fetch('/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, type, note }),
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setTitle('');
        setNote('');
        onClose();
      }, 2000);
    } catch (err) {
      console.error(err);
    }
    setIsSubmitting(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[101] px-4"
          >
            <div className="glass-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xl font-poppins font-semibold text-white flex items-center gap-2">
                  <Heart className="w-5 h-5 text-pink-500" /> Request Content
                </h3>
                <button onClick={onClose} className="text-brand-muted hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6">
                 {success ? (
                    <div className="text-center py-8">
                       <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Check className="w-8 h-8" />
                       </div>
                       <h4 className="text-xl font-semibold text-white">Your request has been submitted successfully.</h4>
                    </div>
                 ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-brand-muted mb-2">Content Title *</label>
                        <input 
                          type="text" 
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Solo Leveling Season 3"
                          className="w-full glass bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-brand-primary transition-all"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-brand-muted mb-2">Category</label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setIsOpenSelect(!isOpenSelect)}
                            className="w-full flex items-center justify-between glass bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white hover:bg-white/10 focus:outline-none focus:border-brand-primary transition-all text-left"
                          >
                            <span>{type}</span>
                            <ChevronDown className={`w-4 h-4 text-brand-muted transition-transform duration-200 ${isOpenSelect ? 'rotate-180 text-white' : ''}`} />
                          </button>

                          <AnimatePresence>
                            {isOpenSelect && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsOpenSelect(false)} />
                                <motion.ul
                                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute z-20 w-full mt-2 bg-[#151B2D] border border-white/10 rounded-xl py-1 overflow-hidden shadow-2xl"
                                >
                                  {categories.map((cat) => (
                                    <li key={cat}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setType(cat);
                                          setIsOpenSelect(false);
                                        }}
                                        className={`w-full text-left py-2.5 px-4 text-sm transition-colors ${
                                          type === cat 
                                            ? 'bg-brand-primary/20 text-brand-primary font-medium' 
                                            : 'text-white/80 hover:bg-white/5 hover:text-white'
                                        }`}
                                      >
                                        {cat}
                                      </button>
                                    </li>
                                  ))}
                                </motion.ul>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-brand-muted mb-2">Optional Note</label>
                        <textarea 
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Any specific version or language?"
                          className="w-full glass bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-brand-primary transition-all resize-none h-20"
                        />
                      </div>
                      <button 
                        type="submit"
                        disabled={isSubmitting || !title.trim()}
                        className="w-full mt-4 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 py-3 rounded-xl transition-all shadow-lg"
                      >
                        {isSubmitting ? 'Sending...' : <><Send className="w-5 h-5" /> Submit</>}
                      </button>
                    </form>
                 )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Check(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
