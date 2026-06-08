'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Music2, Play, Pause, Volume2, VolumeX, X } from 'lucide-react'

// LocalStorage keys for persistence
const LS_MUSIC_USER_ENABLED = 'wedding_music_user_enabled'
const LS_MUSIC_DISMISSED = 'wedding_music_prompt_dismissed'

interface AmbientMusicPlayerProps {
  musicFile: string
  defaultVolume: number
  enabled: boolean
}

export default function AmbientMusicPlayer({ musicFile, defaultVolume, enabled }: AmbientMusicPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentSrcRef = useRef('')

  // Initialize or re-initialize audio element when musicFile changes
  useEffect(() => {
    if (!enabled || !musicFile) return

    // If the source hasn't changed, don't re-initialize
    if (currentSrcRef.current === musicFile) return
    currentSrcRef.current = musicFile

    // Clean up previous audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }

    const audio = new Audio()
    audio.preload = 'auto' // Preload for better autoplay experience
    audio.loop = true
    audio.volume = defaultVolume
    audio.src = musicFile

    audioRef.current = audio

    // Check user preference
    const userPref = localStorage.getItem(LS_MUSIC_USER_ENABLED)
    const shouldTryAutoplay = userPref === null || userPref === 'true'
    const wasDismissed = localStorage.getItem(LS_MUSIC_DISMISSED) === 'true'

    if (shouldTryAutoplay) {
      // Try autoplay - browsers may block this
      audio.play().then(() => {
        setIsPlaying(true)
        localStorage.setItem(LS_MUSIC_USER_ENABLED, 'true')
      }).catch(() => {
        // Browser blocked autoplay — show the prompt
        if (!wasDismissed) {
          setShowPrompt(true)
        }
      })
    } else if (!wasDismissed) {
      // User hasn't explicitly dismissed — show prompt
      setShowPrompt(true)
    }

    return () => {
      audio.pause()
      audio.src = ''
      audioRef.current = null
      currentSrcRef.current = ''
    }
  }, [enabled, musicFile, defaultVolume])

  const play = useCallback(async () => {
    if (!audioRef.current) return
    try {
      await audioRef.current.play()
      setIsPlaying(true)
      localStorage.setItem(LS_MUSIC_USER_ENABLED, 'true')
      localStorage.removeItem(LS_MUSIC_DISMISSED)
      setShowPrompt(false)
    } catch (err) {
      console.error('Play error:', err)
    }
  }, [])

  const pause = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.pause()
    setIsPlaying(false)
    localStorage.setItem(LS_MUSIC_USER_ENABLED, 'false')
  }, [])

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }, [isPlaying, pause, play])

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return
    const newMuted = !isMuted
    audioRef.current.volume = newMuted ? 0 : defaultVolume
    setIsMuted(newMuted)
  }, [isMuted, defaultVolume])

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false)
    localStorage.setItem(LS_MUSIC_USER_ENABLED, 'false')
    localStorage.setItem(LS_MUSIC_DISMISSED, 'true')
  }, [])

  // Don't render if music is disabled or no file
  if (!enabled || !musicFile) return null

  return (
    <>
      {/* Autoplay Blocked Prompt */}
      <AnimatePresence>
        {showPrompt && !isPlaying && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] px-4"
          >
            <div
              className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(139,105,20,0.95), rgba(196,162,101,0.95))',
                boxShadow: '0 8px 32px rgba(139,105,20,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
              }}
            >
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Music2 className="w-5 h-5 text-white" />
              </motion.div>
              <div className="text-white">
                <p className="text-sm font-medium">Ambiance musicale</p>
                <p className="text-[11px] text-white/70">Cliquez pour activer la musique</p>
              </div>
              <button
                onClick={play}
                className="ml-2 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
              </button>
              <button
                onClick={dismissPrompt}
                className="ml-1 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white/70" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Music Button */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.5, type: 'spring', stiffness: 200, damping: 20 }}
        className="fixed bottom-6 left-6 z-[55]"
      >
        {/* Expanded Controls */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-14 left-0 flex items-center gap-2 px-3 py-2 rounded-xl shadow-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(253,250,243,0.98), rgba(247,241,229,0.98))',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1), 0 0 0 1px rgba(196,162,101,0.2)',
              }}
            >
              <button
                onClick={togglePlay}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'rgba(196,162,101,0.15)' }}
                title={isPlaying ? 'Pause' : 'Lecture'}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5 text-[#8B6914]" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-[#8B6914] fill-[#8B6914] ml-0.5" />
                )}
              </button>
              <button
                onClick={toggleMute}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: isMuted ? 'rgba(220,38,38,0.1)' : 'rgba(196,162,101,0.15)' }}
                title={isMuted ? 'Activer le son' : 'Couper le son'}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-500/70" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-[#8B6914]" />
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Button */}
        <button
          onClick={() => {
            if (!expanded) {
              setExpanded(true)
              setTimeout(() => setExpanded(false), 5000)
            } else {
              togglePlay()
              setExpanded(false)
            }
          }}
          className="relative w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
          style={{
            background: isPlaying
              ? 'linear-gradient(135deg, #8B6914, #C4A265)'
              : 'linear-gradient(135deg, rgba(253,250,243,0.95), rgba(247,241,229,0.95))',
            boxShadow: isPlaying
              ? '0 4px 16px rgba(139,105,20,0.3), 0 0 0 1px rgba(196,162,101,0.3)'
              : '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(196,162,101,0.2)',
          }}
          title="Musique d'ambiance"
        >
          {isPlaying ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              <Music2 className="w-5 h-5 text-white" />
            </motion.div>
          ) : (
            <Music2 className="w-5 h-5 text-[#8B6914]/60" />
          )}

          {/* Playing indicator dot */}
          {isPlaying && !expanded && (
            <motion.div
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }}
            />
          )}
        </button>
      </motion.div>
    </>
  )
}
