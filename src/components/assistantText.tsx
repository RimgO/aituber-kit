import settingsStore from '@/features/stores/settings'

export const AssistantText = ({ message }: { message: string }) => {
  const characterName = settingsStore((s) => s.characterName)
  const showCharacterName = settingsStore((s) => s.showCharacterName)
  const showPresetQuestions = settingsStore((s) => s.showPresetQuestions)
  const presetQuestions = settingsStore((s) => s.presetQuestions)

  const shouldShowPresetQuestions =
    showPresetQuestions && presetQuestions.length > 0

  return (
    <div
      className={`absolute bottom-0 left-0 ${shouldShowPresetQuestions ? 'md:mb-[180px] mb-[180px]' : 'md:mb-[96px] mb-[80px]'} w-full z-10`}
    >
      <div className="mx-auto max-w-3xl w-full px-4 pb-2">
        <div
          className="relative rounded-3xl overflow-hidden shadow-lg"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,240,230,0.92) 0%, rgba(255,220,230,0.88) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1.5px solid rgba(255,180,160,0.4)',
            fontFamily: "'Noto Sans JP', sans-serif",
          }}
        >
          {/* キャラクター名バー — 設定画面で変更可能 */}
          {showCharacterName && characterName && (
            <div
              className="flex items-center gap-2 px-5 pt-3 pb-1"
            >
              {/* ハートアイコン */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF6B9D">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span
                className="text-xs font-bold tracking-wider"
                style={{ color: '#C0445A' }}
              >
                {characterName}
              </span>
            </div>
          )}

          {/* メッセージ本文 */}
          <div className="px-5 py-3">
            <p
              className="text-base font-medium leading-relaxed"
              style={{ color: '#5C2D3A' }}
            >
              {message.replace(/\[([a-zA-Z]*?)\]/g, '')}
            </p>
          </div>

          {/* 下部のアクセントライン */}
          <div
            className="h-1 w-full"
            style={{
              background:
                'linear-gradient(90deg, #FFB3A7 0%, #FF6B9D 50%, #FFB3A7 100%)',
              opacity: 0.6,
            }}
          />
        </div>
      </div>
    </div>
  )
}
