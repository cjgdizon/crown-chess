import { useState } from 'react';
import { gameStore, useSavedGameSummary } from '../app/gameStore';
import { usePreferences } from '../app/preferencesStore';
import type { GameConfig } from '../domain/types';
import { GameScreen } from './game/GameScreen';
import { MenuScreen } from './menu/MenuScreen';

type Screen = 'menu' | 'game';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const prefs = usePreferences();
  const savedSummary = useSavedGameSummary();

  const handleStartGame = (config: GameConfig) => {
    gameStore.startGame(config);
    setScreen('game');
  };

  const handleResumeGame = () => {
    if (gameStore.resumeSavedGame()) {
      setScreen('game');
    }
  };

  const handleExitToMenu = () => {
    setScreen('menu');
  };

  if (screen === 'game') {
    return <GameScreen onExitToMenu={handleExitToMenu} />;
  }

  return (
    <MenuScreen
      savedSummary={savedSummary}
      prefs={prefs}
      onStartGame={handleStartGame}
      onResumeGame={handleResumeGame}
    />
  );
}
