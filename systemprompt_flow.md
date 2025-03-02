:::mermaid
sequenceDiagram
    participant Client
    participant getBestComment
    participant getMessagesForSleep
    participant getAnotherTopic
    participant getMessagesForNewTopic
    participant checkIfResponseContinuationIsRequired
    participant getMessagesForContinuation
    participant getLastMessages
    participant getCommonSystemMessage
    participant fetchAIResponse

    %% コメント選択フロー
    Client->>getBestComment: YouTube comments & messages
    getBestComment->>getLastMessages: Get last 10 messages
    getBestComment->>fetchAIResponse: Get AI response
    fetchAIResponse-->>getBestComment: Return best comment
    getBestComment-->>Client: Return selected comment

    %% 休憩モードフロー
    Client->>getMessagesForSleep: System prompt & messages
    getMessagesForSleep->>getLastMessages: Get last 10 messages
    getMessagesForSleep->>getCommonSystemMessage: Create system message
    getCommonSystemMessage-->>getMessagesForSleep: Return formatted message
    getMessagesForSleep-->>Client: Return sleep mode messages

    %% 新しい話題フロー
    Client->>getAnotherTopic: Messages
    getAnotherTopic->>getLastMessages: Get last 10 messages
    getAnotherTopic->>fetchAIResponse: Get new topic
    fetchAIResponse-->>getAnotherTopic: Return topic
    getAnotherTopic-->>Client: Return new topic

    %% 話題切り替えフロー
    Client->>getMessagesForNewTopic: System prompt, messages & topic
    getMessagesForNewTopic->>getLastMessages: Get last 10 messages
    getMessagesForNewTopic->>getCommonSystemMessage: Create system message
    getCommonSystemMessage-->>getMessagesForNewTopic: Return formatted message
    getMessagesForNewTopic-->>Client: Return topic change messages

    %% 会話継続判断フロー
    Client->>checkIfResponseContinuationIsRequired: Messages
    checkIfResponseContinuationIsRequired->>getLastMessages: Get last 10 messages
    checkIfResponseContinuationIsRequired->>fetchAIResponse: Get continuation decision
    fetchAIResponse-->>checkIfResponseContinuationIsRequired: Return decision
    checkIfResponseContinuationIsRequired-->>Client: Return boolean

    %% 会話継続フロー
    Client->>getMessagesForContinuation: System prompt & messages
    getMessagesForContinuation->>getLastMessages: Get last 10 messages
    getMessagesForContinuation->>getCommonSystemMessage: Create system message
    getCommonSystemMessage-->>getMessagesForContinuation: Return formatted message
    getMessagesForContinuation-->>Client: Return continuation messages