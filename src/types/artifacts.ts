export interface RunArtifact {
  id: string;
  name: string;
  path: string;
}

export interface RunArtifactContent {
  artifact_id: string;
  name: string;
  path: string;
  content: string;
}
