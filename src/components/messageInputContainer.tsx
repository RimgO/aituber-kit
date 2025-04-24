import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageInput } from '@/components/messageInput'
import settingsStore from '@/features/stores/settings'
import { VoiceLanguage } from '@/features/constants/settings'
import webSocketStore from '@/features/stores/websocketStore'
import { useTranslation } from 'react-i18next'
import toastStore from '@/features/stores/toast'
import cammicApp from './cammic'
import { CameraMonitor } from './cameraMonitor'

const NO_SPEECH_TIMEOUT = 3000

// AudioContext の型定義を拡張
type AudioContextType = typeof AudioContext

type Props = {
  onChatProcessStart: (text: string) => void
  initialTranscript?: string
}

// Add this outside the component at the module level
// This guarantees the variable is shared across all invocations
let lastUserDetectionTime = 0;
let isUserDetectionProcessing = false;

export const MessageInputContainer = ({ 
  onChatProcessStart,
  initialTranscript = ''
}: Props) => {
  const realtimeAPIMode = settingsStore.getState().realtimeAPIMode
  const [userMessage, setUserMessage] = useState(initialTranscript || '')
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null)
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const keyPressStartTime = useRef<number | null>(null)
  const transcriptRef = useRef('')
  const isKeyboardTriggered = useRef(false)
  const audioBufferRef = useRef<Float32Array | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const isListeningRef = useRef(false)
  const [isListening, setIsListening] = useState(false)
  const cammicRef = useRef<InstanceType<typeof cammicApp> | null>(null)
  const [currentTranscript, setCurrentTranscript] = useState(initialTranscript || '')
  // ユーザーID管理用
  const currentUserIdRef = useRef<string | null>(null)
  const prevUserIdRef = useRef<string | null>(null)
  const lastChatProcessTimeRef = useRef<number>(0) // Add this to track the last time onChatProcessStart was called

  const [enableAutoVoiceStart, setEnableAutoVoiceStart] = useState(true)
  const prevTranscriptLengthRef = useRef(0)

  const { t } = useTranslation()

  const checkMicrophonePermission = async (): Promise<boolean> => {
    // Firefoxの場合はエラーメッセージを表示して終了
    if (navigator.userAgent.toLowerCase().includes('firefox')) {
      toastStore.getState().addToast({
        message: t('Toasts.FirefoxNotSupported'),
        type: 'error',
        tag: 'microphone-permission-error-firefox',
      })
      return false
    }

    try {
      // getUserMediaを直接呼び出し、ブラウザのネイティブ許可モーダルを表示
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch (error) {
      // ユーザーが明示的に拒否した場合や、その他のエラーの場合
      console.error('Microphone permission error:', error)
      return false
    }
  }

  const getVoiceLanguageCode = (selectLanguage: string): VoiceLanguage => {
    switch (selectLanguage) {
      case 'ja':
        return 'ja-JP'
      case 'en':
        return 'en-US'
      case 'zh':
        return 'zh-TW'
      case 'zh-TW':
        return 'zh-TW'
      case 'ko':
        return 'ko-KR'
      default:
        return 'ja-JP'
    }
  }

  // Add initialization effect for cammicApp
  useEffect(() => {
    const initializeCammic = async () => {
      console.log("Initializing cammicApp");
      if (!cammicRef.current) {
        try {
          // インスタンス作成前にログを追加
          console.log("Creating new cammicApp instance...");
          const cammicInstance = new cammicApp();
          cammicRef.current = cammicInstance;
          console.log("cammicApp instance created successfully");

          // 初期化状態をログ出力
          console.log("cammicApp state:", {
            isInitialized: !!cammicRef.current,
            instance: cammicRef.current
          });

          // Set up transcript callback before starting
          cammicRef.current.setTranscriptCallback((transcript: string) => {
            setUserMessage(transcript);
            setCurrentTranscript(transcript);

            if (prevTranscriptLengthRef.current > 0 && prevTranscriptLengthRef.current !== transcript.length) {
              setTimeout(() => {
                if (prevTranscriptLengthRef.current === transcript.length) {
                  if (cammicRef.current) {
                    // Use the transcript directly instead of relying on state
                    handleSendMessage(transcript);
                    transcriptRef.current = ''; // transcript をリセット
                    setUserMessage(''); // UI 上のメッセージもリセット
                    prevTranscriptLengthRef.current = 0;
                    
                    // 送信後は停止状態を維持（TTS再生時に音声認識を停止するため）
                  }
                }
              }, NO_SPEECH_TIMEOUT); // ここで変数を使用
            }
            prevTranscriptLengthRef.current = transcript.length;
          });

          // 初回は自動的に音声認識を開始しない
          // ユーザーが検出されたときのみ start() が呼ばれる
          console.log("cammicApp initialized successfully, waiting for user detection");
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('permission denied')) {
              console.error("Microphone access was denied by the user");
              // Potentially show a user-friendly message here
            } else {
              console.error("Failed to initialize cammicApp:", error.message);
            }
          }
          // Clean up the failed instance
          cammicRef.current = null;
        }
      }
    };

    initializeCammic();

    return () => {
      if (cammicRef.current) {
        cammicRef.current.stop();
        cammicRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const newRecognition = new SpeechRecognition()
      const ss = settingsStore.getState()
      newRecognition.lang = getVoiceLanguageCode(ss.selectLanguage)
      newRecognition.continuous = true
      newRecognition.interimResults = true

      let noSpeechTimeout: NodeJS.Timeout

      // 音声認識開始時のハンドラを追加
      newRecognition.onstart = () => {
        noSpeechTimeout = setTimeout(() => {
          toastStore.getState().addToast({
            message: t('Toasts.SpeechRecognitionError'),
            type: 'error',
            tag: 'no-speech-detected',
          })
          stopListening()
        }, NO_SPEECH_TIMEOUT)
      }

      // 音声入力検出時のハンドラを追加
      newRecognition.onspeechstart = () => {
        clearTimeout(noSpeechTimeout)
      }

      // 音声認識終了時のハンドラを追加
      newRecognition.onend = () => {
        clearTimeout(noSpeechTimeout)
      }

      newRecognition.onresult = (event) => {
        if (!isListeningRef.current) return

        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join('')
        transcriptRef.current = transcript
        setUserMessage(transcript)
      }

      newRecognition.onerror = (event) => {
        stopListening()
      }

      setRecognition(newRecognition)
    }
  }, [])

  useEffect(() => {
    const AudioContextClass = (window.AudioContext ||
      (window as any).webkitAudioContext) as AudioContextType
    const context = new AudioContextClass()
    setAudioContext(context)
  }, [])

  const startListening = useCallback(async () => {
    const hasPermission = await checkMicrophonePermission()
    if (!hasPermission) return

    if (recognition && !isListeningRef.current && audioContext) {
      transcriptRef.current = ''
      setUserMessage('')
      try {

        // Add check to ensure recognition isn't already running
        if (recognition && !isListeningRef.current) {
          recognition.start()
        } else {
          console.log('Recognition is already running, stopping first')
          recognition.stop()
          // Add a small delay before restarting
          setTimeout(() => {
            try {
              recognition.start()
            } catch (error) {
              console.error('Error restarting recognition:', error)
            }
          }, 100)
        }
      } catch (error) {
        console.error('Error starting recognition:', error)
        // If the error was due to recognition already running, we should update our state
        if (error instanceof DOMException && error.name === 'InvalidStateError') {
          isListeningRef.current = true
          setIsListening(true)
        }
      }
      isListeningRef.current = true
      setIsListening(true)

      if (realtimeAPIMode) {
        audioChunksRef.current = [] // 音声チャンクをリセット

        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
          setMediaRecorder(recorder)

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              if (!isListeningRef.current) {
                recognition.stop()
                recorder.stop()
                recorder.ondataavailable = null
                return
              }
              audioChunksRef.current.push(event.data)
              console.log('add audio chunk:', audioChunksRef.current.length)
            }
          }

          recorder.start(100) // より小さな間隔でデータを収集
        })
      }
    }
  }, [recognition, audioContext, realtimeAPIMode])

  const sendAudioBuffer = useCallback(() => {
    if (audioBufferRef.current && audioBufferRef.current.length > 0) {
      const base64Chunk = base64EncodeAudio(audioBufferRef.current)
      const ss = settingsStore.getState()
      const wsManager = webSocketStore.getState().wsManager
      if (wsManager?.websocket?.readyState === WebSocket.OPEN) {
        let sendContent: { type: string; text?: string; audio?: string }[] = []

        if (ss.realtimeAPIModeContentType === 'input_audio') {
          console.log('Sending buffer. Length:', audioBufferRef.current.length)
          sendContent = [
            {
              type: 'input_audio',
              audio: base64Chunk,
            },
          ]
        } else {
          const currentText = transcriptRef.current.trim()
          console.log('Sending text. userMessage:', currentText)
          if (currentText) {
            sendContent = [
              {
                type: 'input_text',
                text: currentText,
              },
            ]
          }
        }

        if (sendContent.length > 0) {
          wsManager.websocket.send(
            JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: sendContent,
              },
            })
          )
          wsManager.websocket.send(
            JSON.stringify({
              type: 'response.create',
            })
          )
        }
      }
      audioBufferRef.current = null // 送信後にバッファをクリア
    } else {
      console.error('音声バッファが空です')
    }
  }, [])

  const stopListening = useCallback(async () => {
    isListeningRef.current = false
    setIsListening(false)
    if (recognition) {
      recognition.stop()

      if (realtimeAPIMode) {
        if (mediaRecorder) {
          mediaRecorder.stop()
          mediaRecorder.ondataavailable = null
          await new Promise<void>((resolve) => {
            mediaRecorder.onstop = async () => {
              console.log('stop MediaRecorder')
              if (audioChunksRef.current.length > 0) {
                const audioBlob = new Blob(audioChunksRef.current, {
                  type: 'audio/webm',
                })
                const arrayBuffer = await audioBlob.arrayBuffer()
                const audioBuffer =
                  await audioContext!.decodeAudioData(arrayBuffer)
                const processedData = processAudio(audioBuffer)

                audioBufferRef.current = processedData
                resolve()
              } else {
                console.error('音声チャンクが空です')
                resolve()
              }
            }
          })
        }
        sendAudioBuffer()
      }

      const trimmedTranscriptRef = transcriptRef.current.trim()
      if (isKeyboardTriggered.current) {
        const pressDuration = Date.now() - (keyPressStartTime.current || 0)
        // 押してから1秒以上 かつ 文字が存在する場合のみ送信
        if (pressDuration >= 1000 && trimmedTranscriptRef) {
          onChatProcessStart(trimmedTranscriptRef)
          setUserMessage('')
        }
        isKeyboardTriggered.current = false
      }
    }
  }, [
    recognition,
    realtimeAPIMode,
    mediaRecorder,
    sendAudioBuffer,
    audioContext,
    onChatProcessStart,
  ])

  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      stopListening()
    } else {
      keyPressStartTime.current = Date.now()
      isKeyboardTriggered.current = true
      startListening()
    }
  }, [startListening, stopListening])

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Alt' && !isListeningRef.current) {
        keyPressStartTime.current = Date.now()
        isKeyboardTriggered.current = true
        await startListening()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && isListeningRef.current) {
        stopListening()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [startListening, stopListening])

  
  // メッセージ送信
  const handleSendMessage = useCallback((transcriptText?: string) => {
    console.log('handleSendMessage/userMessage:', userMessage);
    console.log('handleSendMessage/transcriptText:', transcriptText);
    
    const messageToSend = transcriptText || userMessage.trim();
    
    if (messageToSend && typeof onChatProcessStart === 'function') {
      try {
        // Stop recording before sending message
        if (cammicRef.current) {
          console.log('Stopping cammic recording before sending message');
          cammicRef.current.stop();
        }

        console.log('Sending message:', messageToSend);
        onChatProcessStart(messageToSend);
        setUserMessage('');

        // TTS再生が完了するまでは再開しないように変更
        // 以前のリスナー登録コードは削除
      } catch (error) {
        console.error('Error sending message:', error);
        // Handle circular reference error
        if (error instanceof TypeError && error.message.includes('circular')) {
          toastStore.getState().addToast({
            message: t('Toasts.CircularReferenceError'),
            type: 'error',
            tag: 'circular-reference-error',
          });
        }
      }
    } else {
      console.error('Message is empty or onChatProcessStart is not a function', {
        userMessage,
        transcriptText,
        isFunction: typeof onChatProcessStart === 'function'
      });
    }
  }, [userMessage, onChatProcessStart])

  // メッセージ入力
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      console.log('handleInputChange:', e.target.value)
      setUserMessage(e.target.value)
    },
    []
  )

  // Add this flag to track if a detection is currently being processed
  const userDetectionInProgressRef = useRef(false);

  // ユーザー検出時のハンドラ
  const handleUserDetected = useCallback((userId: string, isNewUser: boolean) => {
    console.log(`ユーザー検出: ${userId}, 新規ユーザー: ${isNewUser}, 前回ユーザー：${prevUserIdRef.current}`);

    // 無効なユーザーIDを無視
    if (userId.endsWith('null') || userId === 'not_detected') {
      console.warn('Invalid user detected, ignoring:', userId);
      return;
    }
    
    const currentTime = Date.now();
    
    // =========== モジュールレベルの処理フラグを最初にチェック ===========
    if (isUserDetectionProcessing) {
      console.log('ユーザー検出: グローバル処理フラグによりスキップします');
      return;
    }
    
    // =========== モジュールレベルのタイムスタンプによるデバウンス ===========
    const timeSinceLastGlobalDetection = currentTime - lastUserDetectionTime;
    if (timeSinceLastGlobalDetection < 3000 && lastUserDetectionTime > 0) {
      console.log(`ユーザー検出: グローバルデバウンス期間内のためスキップします (${timeSinceLastGlobalDetection}ms)`);
      return;
    }
    
    // =========== 両方のフラグをセットして二重処理を防止 ===========
    isUserDetectionProcessing = true;
    userDetectionInProgressRef.current = true;
    
    try {
      console.log(`ユーザー検出: 現在の時刻=${currentTime}, グローバル前回時刻=${lastUserDetectionTime}`);
      
      // ユーザーが新しく検出された場合、または前回のユーザーと異なる場合のみ処理
      if (currentUserIdRef.current !== userId) {
        // 前回のユーザーIDを保存してから現在のIDを更新
        const prevUserId = currentUserIdRef.current;
        currentUserIdRef.current = userId;
      
        // 前回と今回のユーザーIDを正確に比較
        const isNewUserDetection = prevUserId === null && userId !== null;
        const isUserChanged = prevUserId !== userId && prevUserId !== null;
        
        if (isNewUserDetection || isUserChanged) {
          console.log(`ユーザー検出: ${isNewUserDetection ? '新規ユーザー' : '既存ユーザーとの再会'}`);
          
          // 両方のタイムスタンプを更新してからメッセージを送信
          console.log(`ユーザー検出: グローバル時刻を記録 ${currentTime}`);
          lastUserDetectionTime = currentTime;
          lastChatProcessTimeRef.current = currentTime;
          
          onChatProcessStart("ユーザーがいらっしゃいました。");
          
          // 処理後に確認ログ
          console.log(`ユーザー検出: 処理後のグローバルタイムスタンプ=${lastUserDetectionTime}`);
        } else {
          console.log('ユーザー検出: 前回と同じユーザー、メッセージ送信をスキップ');
        }
      
        console.log('ユーザー検出: 録音準備完了 (TTS再生完了後に開始)', userId, prevUserId, currentTime);
        prevUserIdRef.current = userId;
      } else {
        console.log('ユーザー検出: 同一ユーザー、処理をスキップ');
      }
    } finally {
      // 処理中フラグを解放する前に少し待機
      setTimeout(() => {
        console.log('ユーザー検出: 処理フラグをリセット');
        userDetectionInProgressRef.current = false;
        isUserDetectionProcessing = false;
      }, 1000);
    }
  }, [onChatProcessStart]);

  // ユーザーが検出されなくなった時のハンドラ
  const handleUserDisappeared = useCallback(() => {
    if (currentUserIdRef.current) {
      // 同じくデバウンスを適用
      const currentTime = Date.now();
      if (currentTime - lastChatProcessTimeRef.current > 3000) {
        console.log('ユーザーがいなくなりました。');
        onChatProcessStart("ユーザーがいなくなりました。");
        lastChatProcessTimeRef.current = currentTime;
      }

      // ユーザーIDをクリア
      currentUserIdRef.current = null;
  
      // cammic 録音を停止
      if (cammicRef.current) {
        console.log('ユーザー不在: cammic録音を停止');
        cammicRef.current.stop();
        setCurrentTranscript('');
        setUserMessage('');
      }
  
      // 音声入力中なら停止
      if (isListeningRef.current) {
        console.log('ユーザー不在: Web Speech API音声入力を停止');
        stopListening();
      }
    }
  }, [stopListening, onChatProcessStart]);

  useEffect(() => {
    const wsManager = webSocketStore.getState().wsManager;
    if (wsManager?.websocket) {
      // Handle voice start - AIの発話開始時に音声認識を停止
      const handleVoiceStart = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data.type === 'voice.start') {
          if (cammicRef.current) {
            console.log('AI発話開始: 音声認識を停止');
            cammicRef.current.stop();
          }
        }
      };

      // Handle voice complete - AIの発話完了時に、ユーザーがいる場合のみ音声認識を再開
      const handleVoiceComplete = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data.type === 'voice.complete') {
          if (cammicRef.current && currentUserIdRef.current) {
            const userId = currentUserIdRef.current;
            // 男性ユーザーの場合のみ録音開始
            if (userId.endsWith('male')) {
              console.log('AI発話完了: 男性ユーザーがいるため音声認識を開始');
              cammicRef.current.start().catch(err => {
                console.error('Failed to start recording after AI speech:', err);
              });
            } else {
              console.log('AI発話完了: 男性以外のユーザーは録音しない');
            }
          } else {
            console.log('AI発話完了: ユーザーがいないため音声認識は開始しない');
          }
        }
      };

      wsManager.websocket.addEventListener('message', handleVoiceStart);
      wsManager.websocket.addEventListener('message', handleVoiceComplete);

      return () => {
        wsManager.websocket.removeEventListener('message', handleVoiceStart);
        wsManager.websocket.removeEventListener('message', handleVoiceComplete);
      };
    }
  }, []);

  // VOICEVOXで音声合成し再生する関数を修正
  const speakWithVoicevox = async (text: string) => {
    try {
      // 音声認識を確実に停止（TTS再生中は音声認識をしない）
      if (cammicRef.current) {
        console.log('TTS音声再生前に音声認識を停止');
        cammicRef.current.stop();
      }

      // 設定ストアから音声設定を取得
      const settings = settingsStore.getState();
      const voiceSettings = {
        // 設定値がある場合はそれを使用し、なければデフォルト値を使用
        speaker: settings.voicevoxSpeaker || 1,
        speed: settings.voicevoxSpeed || 1.0,
        pitch: settings.voicevoxPitch || 0.0,
        intonation: settings.voicevoxIntonation || 1.0
      };
      
      console.log('VOICEVOXの音声設定:', voiceSettings);
      
      // VOICEVOXのAPIを呼び出し
      const response = await fetch('/api/tts-voicevox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          speaker: voiceSettings.speaker,
          speed: voiceSettings.speed,
          pitch: voiceSettings.pitch,
          intonation: voiceSettings.intonation
        }),
      });
      
      if (!response.ok) throw new Error('TTS音声合成に失敗しました');
      
      // レスポンスからBlobを作成
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // TTS音声再生完了コールバックを設定
      if (cammicRef.current) {
        // 音声再生完了時のコールバックを設定
        cammicRef.current.setTtsAudioEndCallback(() => {
          console.log('TTS音声再生完了、ユーザーがいる場合は音声認識を再開');
          // ユーザーがまだ存在する場合のみ音声認識を再開
          if (currentUserIdRef.current) {
            cammicRef.current?.start().catch(err => {
              console.error('Failed to restart recording after TTS:', err);
            });
          }
        });
        
        // TTS音声を再生し、完了を待つ
        await cammicRef.current.playTtsAudio(audioUrl);
      }
      
      // 使用後はURLを解放
      URL.revokeObjectURL(audioUrl);
    } catch (error) {
      console.error('TTS音声再生エラー:', error);
      // エラー時にも音声認識を再開（ユーザーがいる場合のみ）
      if (cammicRef.current && currentUserIdRef.current) {
        cammicRef.current.start().catch(err => console.error('Error restarting after TTS error:', err));
      }
    }
  };

  return (
    <>
      {/* カメラモニターをコンポーネントとして埋め込む */}
      <CameraMonitor 
        onUserDetected={handleUserDetected}
        onUserDisappeared={handleUserDisappeared}
        pollInterval={10000} // 10秒ごとにチェック
      />
      
      <div className="flex gap-2 p-2">
        <MessageInput
          userMessage={userMessage}
          isMicRecording={isListening}
          onChangeUserMessage={handleInputChange}
          onClickMicButton={toggleListening}
          onClickSendButton={handleSendMessage}
          chatProcessing={false}
          slidePlaying={false}
        />
      </div>
    </>
  )
}

// リサンプリング関数
const resampleAudio = (
  audioData: Float32Array,
  fromSampleRate: number,
  toSampleRate: number
): Float32Array => {
  const ratio = fromSampleRate / toSampleRate
  const newLength = Math.round(audioData.length / ratio)
  const result = new Float32Array(newLength)

  for (let i = 0; i < newLength; i++) {
    const position = i * ratio
    const leftIndex = Math.floor(position)
    const rightIndex = Math.ceil(position)
    const fraction = position - leftIndex

    if (rightIndex >= audioData.length) {
      result[i] = audioData[leftIndex]
    } else {
      result[i] =
        (1 - fraction) * audioData[leftIndex] + fraction * audioData[rightIndex]
    }
  }

  return result
}

// リサンプリングとモノラル変換を行う関数
const processAudio = (audioBuffer: AudioBuffer): Float32Array => {
  const targetSampleRate = 24000
  const numChannels = audioBuffer.numberOfChannels

  // モノラルに変換
  let monoData = new Float32Array(audioBuffer.length)
  for (let i = 0; i < audioBuffer.length; i++) {
    let sum = 0
    for (let channel = 0; channel < numChannels; channel++) {
      sum += audioBuffer.getChannelData(channel)[i]
    }
    monoData[i] = sum / numChannels
  }

  // リサンプリング
  return resampleAudio(monoData, audioBuffer.sampleRate, targetSampleRate)
}

// Float32Array を PCM16 ArrayBuffer に変換する関数
const floatTo16BitPCM = (float32Array: Float32Array) => {
  const buffer = new ArrayBuffer(float32Array.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

// Float32Array を base64エンコードされた PCM16 データに変換する関数
const base64EncodeAudio = (float32Array: Float32Array) => {
  const arrayBuffer = floatTo16BitPCM(float32Array)
  let binary = ''
  const bytes = new Uint8Array(arrayBuffer)
  const chunkSize = 0x8000 // 32KB chunk size
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    )
  }
  return btoa(binary)
}
