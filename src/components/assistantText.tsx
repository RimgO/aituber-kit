import settingsStore from '@/features/stores/settings'

export const AssistantText = ({ message }: { message: string }) => {
  const characterName = settingsStore((s) => s.characterName)
  const showCharacterName = settingsStore((s) => s.showCharacterName)

  return (
    <div className="absolute bottom-0 left-0 md:mb-[96px] mb-[80px] w-full z-10">
      <div className="mx-auto max-w-4xl w-full p-16">
        <div className="bg-white rounded-8">
          {showCharacterName && (
            <div className="px-24 py-8 bg-secondary rounded-t-8 text-white font-bold tracking-wider">
                {characterName}
            </div>
          )}
          <div className="px-24 py-16">
            <div
              className="line-clamp-4 text-secondary typography-48 font-bold"
              style={{
                fontSize: '48px', // 16px × 3 = 48px
                wordWrap: 'break-word', // 長い単語を折り返し
                wordBreak: 'break-word', // 単語の途中で改行
                overflowWrap: 'break-word', // レスポンシブ対応
              }}
            >
              {message.replace(/\[([a-zA-Z]*?)\]/g, '')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
