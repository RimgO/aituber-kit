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
  const prevUserIdRef = useRef<string | null>(null);

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
                    cammicRef.current.stop();
                  }
                }
              }, NO_SPEECH_TIMEOUT); // ここで変数を使用
            }
            prevTranscriptLengthRef.current = transcript.length;
          });

          // Don't auto-start - we'll start when a user is detected
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

  // Add a safe JSON stringifier utility function to the component
  const safeStringify = useCallback((obj: any): string => {
    try {
      // Create a new object without circular references
      const seen = new WeakSet();
      return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        return value;
      });
    } catch (error) {
      console.error('Failed to stringify object:', error);
      return JSON.stringify({ error: 'Failed to stringify object' });
    }
  }, []);

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
          try {
            const messageData = {
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: sendContent,
              },
            };
            
            const responseData = {
              type: 'response.create'
            };
            
            wsManager.websocket.send(JSON.stringify(messageData));
            wsManager.websocket.send(JSON.stringify(responseData));
          } catch (error) {
            console.error('Error sending WebSocket message:', error);
            toastStore.getState().addToast({
              message: t('Toasts.WebSocketError'),
              type: 'error',
              tag: 'websocket-send-error',
            });
          }
        }
      }
      audioBufferRef.current = null // 送信後にバッファをクリア
    } else {
      console.error('音声バッファが空です')
    }
  }, [t]);

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

        // Create a simple string message - avoid complex objects
        const simpleMessage = String(messageToSend).trim();
        console.log('Sending message:', simpleMessage);
        
        // Use setTimeout to break any potential stack recursion
        setTimeout(() => {
          try {
            onChatProcessStart(simpleMessage);
          } catch (error) {
            console.error('Error in onChatProcessStart:', error);
            toastStore.getState().addToast({
              message: t('Toasts.MessageSendError'),
              type: 'error',
              tag: 'message-send-error',
            });
          }
        }, 0);
        
        setUserMessage('');

        // Listen for voice playback completion with improved error handling
        const wsManager = webSocketStore.getState().wsManager;
        if (wsManager?.websocket) {
          const handleVoiceComplete = (event: MessageEvent) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'voice.complete') {
                // Start recording again after voice playback
                if (cammicRef.current && currentUserIdRef.current) {
                  console.log('Voice playback complete, resuming cammic recording');
                  cammicRef.current.start().catch(err => {
                    console.error('Failed to resume cammic recording:', err);
                  });
                }
                // Remove the event listener
                wsManager.websocket?.removeEventListener('message', handleVoiceComplete);
              }
            } catch (error) {
              console.error('Error handling voice complete:', error);
              wsManager.websocket?.removeEventListener('message', handleVoiceComplete);
            }
          };
          wsManager.websocket?.addEventListener('message', handleVoiceComplete);
        }
      } catch (error) {
        console.error('Error sending message:', error);
        toastStore.getState().addToast({
          message: t('Toasts.MessageSendError'),
          type: 'error',
          tag: 'message-send-error',
        });
      }
    } else {
      console.error('Message is empty or onChatProcessStart is not a function', {
        messageLength: messageToSend?.length,
        isFunction: typeof onChatProcessStart === 'function'
      });
    }
  }, [userMessage, onChatProcessStart, t]);

  // メッセージ入力
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      console.log('handleInputChange:', e.target.value)
      setUserMessage(e.target.value)
    },
    []
  )

  // ユーザー検出時のハンドラ
  const handleUserDetected = useCallback((userId: string, isNewUser: boolean) => {
    console.log(`ユーザー検出: ${userId}, 新規ユーザー: ${isNewUser}`);
  
    // 無効なユーザーIDを無視
    if (userId.endsWith('null') || userId === 'not_detected') {
      console.warn('Invalid user detected, ignoring:', userId);
      return;
    }
  
    // ユーザーが新しく検出された場合、または前回のユーザーと異なる場合のみ処理
    if (currentUserIdRef.current !== userId) {
      currentUserIdRef.current = userId;
  
      // 既存ユーザーで前回と異なるユーザーの場合はメッセージを送信
      if (!isNewUser) {
        console.log('ユーザー検出: ユーザーとの再会'); //for debug
        if(prevUserIdRef.current !== userId && prevUserIdRef.current !== null) {
          console.log('ユーザー検出: 既存ユーザーとの再会');
          // Use setTimeout to break any potential stack recursion
          setTimeout(() => {
            try {
              onChatProcessStart("ユーザーがいらっしゃいました。");
            } catch (error) {
              console.error('Error in onChatProcessStart:', error);
              toastStore.getState().addToast({
                message: t('Toasts.MessageSendError'),
                type: 'error',
                tag: 'message-send-error',
              });
            }
          }, 0);
        } else {
          console.log('ユーザー検出: 前回と同じユーザー');
        }
      } else {
        console.log('ユーザー検出: 新規ユーザー');
      }
  
      // cammic 録音を開始
      if (cammicRef.current && userId.endsWith('male')) {
        console.log('ユーザー検出: cammic録音を開始');
        cammicRef.current.start().catch(err => {
          console.error('Failed to start cammic recording:', err);
        });
      }
  
      // 前回のユーザーIDを更新
      prevUserIdRef.current = userId;
    }
  }, [onChatProcessStart, t]);

  // ユーザーが検出されなくなった時のハンドラ
  const handleUserDisappeared = useCallback(() => {
    if (currentUserIdRef.current) {
      console.log('ユーザーがいなくなりました。');
      
      // Use setTimeout to break any potential stack recursion
      setTimeout(() => {
        try {
          onChatProcessStart("ユーザーがいなくなりました。");
        } catch (error) {
          console.error('Error in onChatProcessStart:', error);
          toastStore.getState().addToast({
            message: t('Toasts.MessageSendError'),
            type: 'error',
            tag: 'message-send-error',
          });
        }
      }, 0);

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
  }, [stopListening, onChatProcessStart, t]);

  useEffect(() => {
    const wsManager = webSocketStore.getState().wsManager;
    if (wsManager?.websocket) {
      // Handle voice start
      const handleVoiceStart = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'voice.start') {
            if (cammicRef.current) {
              console.log('Voice playback starting, stopping cammic recording');
              cammicRef.current.stop();
            }
          }
        } catch (error) {
          console.error('Error parsing message data:', error);
        }
      };

      // Handle voice complete
      const handleVoiceComplete = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'voice.complete') {
            if (cammicRef.current && currentUserIdRef.current) {
              console.log('Voice playback complete, resuming cammic recording');
              cammicRef.current.start().catch(err => {
                console.error('Failed to resume cammic recording:', err);
              });
            }
          }
        } catch (error) {
          console.error('Error parsing message data:', error);
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

  return (
    <>
      {/* カメラモニターをコンポーネントとして埋め込む */}
      <CameraMonitor 
        onUserDetected={handleUserDetected}
        onUserDisappeared={handleUserDisappeared}
        pollInterval={3000} // 3秒ごとにチェック
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
  let sum = 0
  for (let i = 0; i < audioBuffer.length; i++) {
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
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  const chunkSize = 0x8000 // 32KB chunk size
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    )
  }
  return btoa(binary)
}