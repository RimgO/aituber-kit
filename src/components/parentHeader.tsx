import React, { useState } from 'react'
import Settings from './settings'

/**
 * Parent Voice Generator 専用ヘッダーコンポーネント
 * グラスモーフィズムデザインでアプリロゴと設定ボタンを表示する
 */
export const ParentHeader = () => {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      {/* ヘッダーバー */}
      <header
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,200,150,0.22) 0%, rgba(255,160,180,0.18) 100%)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(255,200,150,0.25)',
          fontFamily: "'Noto Sans JP', sans-serif",
        }}
      >
        {/* ロゴ・アプリ名 */}
        <div className="flex items-center gap-3 select-none">
          {/* ハートマーク + 音声波形のロゴアイコン */}
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shadow-md"
            style={{
              background:
                'linear-gradient(135deg, #FF9A7B 0%, #FF6B9D 100%)',
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* マイク＋ハート合成アイコン */}
              <path
                d="M12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2Z"
                fill="white"
              />
              <path
                d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z"
                fill="white"
              />
              {/* 小さいハート（右下） */}
              <path
                d="M20.5 18.5C20.5 17.5 19 16 17.75 17.1C16.5 16 15 17.5 15 18.5C15 19.88 17.75 22 17.75 22C17.75 22 20.5 19.88 20.5 18.5Z"
                fill="#FFD6E7"
              />
            </svg>
          </div>

          <div>
            <h1
              className="text-sm font-bold leading-tight"
              style={{ color: '#C0445A' }}
            >
              Parent Voice
            </h1>
            <p
              className="text-xs leading-tight"
              style={{ color: 'rgba(180,80,100,0.75)' }}
            >
              Generator
            </p>
          </div>
        </div>

        {/* 右側: 設定ボタン */}
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.45)',
            color: '#C0445A',
            border: '1px solid rgba(255,180,180,0.4)',
            backdropFilter: 'blur(8px)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'rgba(255,255,255,0.65)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = 'rgba(255,255,255,0.45)')
          }
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          設定
        </button>
      </header>

      {/* 設定モーダル */}
      {showSettings && (
        <Settings onClickClose={() => setShowSettings(false)} />
      )}
    </>
  )
}
