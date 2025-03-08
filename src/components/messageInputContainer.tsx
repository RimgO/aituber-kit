import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageInput } from '@/components/messageInput';
import settingsStore from '@/features/stores/settings';
import { useTranslation } from 'react-i18next';
import toastStore from '@/features/stores/toast';
import webSocketStore from '@/features/stores/websocketStore';
import cammicApp from './cammic';
import { CameraMonitor } from './cameraMonitor';

interface Props {
  onChatProcessStart: (text: string) => void;
  initialTranscript?: string;
}

export const MessageInputContainer = ({ 
  onChatProcessStart, 
  initialTranscript = '' 
}: Props) => {
  const [userMessage, setUserMessage] = useState(initialTranscript);
  const [isListening, setIsListening] = useState(false);
  const cammicRef = useRef<InstanceType<typeof cammicApp> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const prevLengthRef = useRef(0);
  const { t } = useTranslation();
  
  /** マイクの権限を確認 */
  const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission error:', error);
      toastStore.getState().addToast({
        message: t('Toasts.MicrophonePermissionDenied'),
        type: 'error',
        tag: 'microphone-permission-error',
      });
      return false;
    }
  };

  /** `cammicApp` の初期化 */
  useEffect(() => {
    if (cammicRef.current) return;

    try {
      console.log("Creating new cammicApp instance...");
      cammicRef.current = new cammicApp();
      console.log("cammicApp instance created successfully");

      cammicRef.current.setTranscriptCallback((transcript: string) => {
        setUserMessage(transcript);

        if (prevLengthRef.current > 0 && prevLengthRef.current !== transcript.length) {
          setTimeout(() => {
            if (prevLengthRef.current === transcript.length && cammicRef.current) {
              handleSendMessage(transcript);
              cammicRef.current.stop();
              if (currentUserIdRef.current) {
                setTimeout(() => cammicRef.current?.start(), 1000);
              }
            }
          }, 1000);
        }
        prevLengthRef.current = transcript.length;
      });

      console.log("cammicApp initialized successfully, waiting for user detection");
    } catch (error) {
      console.error("Failed to initialize cammicApp:", error);
      cammicRef.current = null;
    }
  }, []);

  /** 音声入力を開始 */
  const startListening = useCallback(async () => {
    if (!cammicRef.current) return;
    
    const hasPermission = await checkMicrophonePermission();
    if (!hasPermission) return;

    console.log('Starting cammicApp recording');
    cammicRef.current.start();
    setIsListening(true);
  }, []);

  /** 音声入力を停止 */
  const stopListening = useCallback(() => {
    if (!cammicRef.current) return;

    console.log('Stopping cammicApp recording');
    cammicRef.current.stop();
    setIsListening(false);
  }, []);

  /** 音声入力のトグル */
  const toggleListening = useCallback(() => {
    isListening ? stopListening() : startListening();
  }, [isListening, startListening, stopListening]);

  /** ユーザー検出時に音声入力を開始 */
  const handleUserDetected = useCallback((userId: string, isNewUser: boolean) => {
    console.log(`User detected: ${userId}, New user: ${isNewUser}`);
    currentUserIdRef.current = userId;

    if (cammicRef.current) {
      console.log('User detected: Starting cammic recording');
      cammicRef.current.start();
    }
  }, []);

  /** ユーザー消失時に音声入力を停止 */
  const handleUserDisappeared = useCallback(() => {
    console.log('User disappeared');

    if (cammicRef.current) {
      console.log('User disappeared: Stopping cammic recording');
      cammicRef.current.stop();
      setUserMessage('');
    }

    currentUserIdRef.current = null;
  }, []);

  /** メッセージ送信処理 */
  const handleSendMessage = useCallback((transcriptText?: string) => {
    const messageToSend = transcriptText || userMessage.trim();

    if (messageToSend) {
      try {
        console.log('Sending message:', messageToSend);
        onChatProcessStart(messageToSend);
        setUserMessage('');
      } catch (error) {
        console.error('Error sending message:', error);
      }
    } else {
      console.error('Message is empty or onChatProcessStart is not a function');
    }
  }, [userMessage, onChatProcessStart]);

  return (
    <>
      {/* カメラモニター（ユーザー検出機能） */}
      <CameraMonitor 
        onUserDetected={handleUserDetected}
        onUserDisappeared={handleUserDisappeared}
        pollInterval={3000} // 3秒ごとにチェック
      />
      
      <div className="flex gap-2 p-2">
        <MessageInput
          userMessage={userMessage}
          isMicRecording={isListening}
          onChangeUserMessage={(e) => setUserMessage(e.target.value)}
          onClickMicButton={toggleListening}
          onClickSendButton={handleSendMessage}
          chatProcessing={false}
          slidePlaying={false}
        />
      </div>
    </>
  );
};
