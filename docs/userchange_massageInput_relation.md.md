```mermaid
sequenceDiagram
    participant MessageInputContainer as messageInputContainer.tsx
    participant CameraMonitor as CameraMonitor.tsx
    participant Camera as "Camera API"
    
    Note over MessageInputContainer,CameraMonitor: Component Initialization
    MessageInputContainer->>CameraMonitor: Render with onUserDetected & onUserDisappeared callbacks
    
    loop Every pollInterval ms
        CameraMonitor->>Camera: fetchUserIdFromCamera()
        Camera-->>CameraMonitor: userId (or null)
        
        alt User Detected (userId exists)
            alt New or Changed User
                CameraMonitor->>CameraMonitor: updateUserId(userId)
                CameraMonitor->>CameraMonitor: addUserToHistory(userId)
                CameraMonitor->>MessageInputContainer: onUserDetected(userId, isNewUser)
                MessageInputContainer->>MessageInputContainer: Enable input for user
                MessageInputContainer->>MessageInputContainer: Update UI for current user
            end
        else No User Detected
            CameraMonitor->>MessageInputContainer: onUserDisappeared()
            MessageInputContainer->>MessageInputContainer: Disable input or show waiting UI
        end
    end
    
    Note over MessageInputContainer,Camera: Component Unmounting
    MessageInputContainer->>CameraMonitor: Unmount component
    CameraMonitor->>CameraMonitor: Clear interval timer
