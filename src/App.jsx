// src/App.jsx
import { useState } from 'react';
import Home from './Home';
import Editor from './Editor';
import NewNotationSetup from './NewNotationSetup';
import TalamEditor from './TalamEditor';
import { createBlankNotation, duplicateNotation, deleteNotation } from './storage';

function App() {
  const [openNotationId, setOpenNotationId] = useState(null);
  const [showTalamEditor, setShowTalamEditor] = useState(false);
  // Holds a brand-new notation's data in memory only, until the user
  // manually saves it for the first time — so opening the editor and
  // walking away never litters the home page with an empty entry.
  const [draftNotation, setDraftNotation] = useState(null);
  // Talam/speed are chosen up front, before the editor ever opens, and
  // can't be changed once you're in it.
  const [showNewNotationSetup, setShowNewNotationSetup] = useState(false);

  const handleRequestNew = () => setShowNewNotationSetup(true);

  const handleConfirmNew = (talam, speed, kalai, notationName, ragam, composer, paperSize) => {
    const id = crypto.randomUUID();
    setDraftNotation(createBlankNotation(id, { selectedTalam: talam, speed, kalai, title: notationName, ragam, composer, paperSize }));
    setOpenNotationId(id);
    setShowNewNotationSetup(false);
  };

  const handleExit = () => {
    setOpenNotationId(null);
    setDraftNotation(null);
  };

  const handleDuplicate = (id) => {
    const copy = duplicateNotation(id);
    if (copy) {
      setDraftNotation(null);
      setOpenNotationId(copy.id);
    }
  };

  const handleDelete = (id) => {
    deleteNotation(id);
    setOpenNotationId(null);
    setDraftNotation(null);
  };

  return (
    <>
      {openNotationId ? (
        <Editor
          // Keying by id forces a clean remount (and fresh load from storage)
          // whenever the user switches to a different notation.
          key={openNotationId}
          notationId={openNotationId}
          draftNotation={draftNotation && draftNotation.id === openNotationId ? draftNotation : null}
          onExit={handleExit}
          onNew={handleRequestNew}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      ) : showTalamEditor ? (
        <TalamEditor onBack={() => setShowTalamEditor(false)} />
      ) : (
        <Home onOpen={setOpenNotationId} onCreateNew={handleRequestNew} onManageTalams={() => setShowTalamEditor(true)} />
      )}

      {showNewNotationSetup && (
        <NewNotationSetup
          onConfirm={handleConfirmNew}
          onCancel={() => setShowNewNotationSetup(false)}
        />
      )}
    </>
  );
}

export default App;
