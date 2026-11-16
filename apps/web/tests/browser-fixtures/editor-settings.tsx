import { createRoot } from "react-dom/client";
import { EditorSettings } from "../../src/features/local-folders/documents/editing/EditorSettings";
import "../../src/styles/globals.css";

createRoot(document.getElementById("fixture")!).render(<EditorSettings />);
