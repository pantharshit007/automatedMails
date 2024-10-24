// Type definitions
export interface EmailAnalysis {
  label: "Interested" | "Not Interested" | "More Information";
  analysis: string;
  suggested_response: string;
}

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  payload: {
    headers: GmailMessageHeader[];
    parts?: {
      mimeType: string;
      body: {
        data: string;
      };
    }[];
    body: {
      data: string;
    };
  };
}

export interface EmailBody {
  config: { [key: string]: string };
  data: {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    payload: {
      partId: string;
      mimeType: string;
      filename: string;
      headers: { [key: string]: string }[];
      body: { [key: string]: any };
      parts: { [key: string]: any }[];
    };
    sizeEstimate: number;
    historyId: string;
    internalDate: number;
  };
  headers: {
    [key: string]: string;
  };
  status: number;
  statusText: string;
  request: {
    responseURL: string;
  };
}

export interface GmailLabel {
  id: string;
  name: string;
}
