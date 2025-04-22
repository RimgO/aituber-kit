```Mermaid
stateDiagram-v2
    [*] --> 初期化: コンストラクタ呼び出し
    初期化 --> 待機状態: isFirstStart = true
    
    待機状態 --> 音声認識中: ユーザー検出\ncurrentUserId設定\nstart()呼び出し
    音声認識中 --> 待機状態: ユーザー消失\nsetCurrentUser(null)
    
    音声認識中 --> TTS再生中: playTtsAudio()呼び出し\n(認識を停止)
    待機状態 --> TTS再生中: playTtsAudio()呼び出し
    
    TTS再生中 --> 音声認識中: TTS再生完了 &\nユーザー検出中
    TTS再生中 --> 待機状態: TTS再生完了 &\nユーザーなし
    
    note left of 待機状態
        isFirstStart = false
        isRecognizing = false
        isTtsPlaying = false
    end note
    
    note right of 音声認識中
        isRecognizing = true
        isTtsPlaying = false
        currentUserId != null
    end note
    
    note right of TTS再生中
        isRecognizing = false
        isTtsPlaying = true
        shouldStartAfterTTS = 
        ユーザーあり ? true : false
    end note
```