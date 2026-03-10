---
name: reactjs-senior-dev
description: Используйте, когда необходимо разработать или отрефакторить компоненты, хуки или архитектуру React приложения, следуя принципам SOLID, DRY и KISS. Применяется при работе с Electron, Tailwind CSS и i18next для обеспечения высокого качества кода и масштабируемости.
---

# Senior ReactJS Developer Skill

## Обзор
Данный скилл обеспечивает соблюдение архитектурных стандартов уровня Senior в React-приложении. Он фокусируется на чистоте кода, разделении ответственности и использовании modern best practices.

## Когда использовать
- При создании новых функциональных компонентов.
- При проектировании глобального состояния приложения через Context.
- При интеграции с API или внедрении сложной бизнес-логики.
- При рефакторинге "жирных" компонентов или "prop drilling".
- При необходимости обеспечить поддержку нескольких языков (i18n).

## Основные паттерны

### 1. Логика в Custom Hooks (Logic Separation)
Бизнес-логика, эффекты и работа с данными инкапсулируются в хуки. Компоненты остаются декларативными.

```jsx
// src/hooks/useProxyData.js
export const useProxyData = () => {
  const [data, setData] = useState([]);
  // ... fetch logic
  return { data, isLoading };
};
```

### 2. Composition over Inheritance
Использование паттерна "слотов" и передачи компонентов через props для гибкости.

### 3. Глобальный стейт через Context + Hooks
Каждая область ответственности имеет свой Provider и кастомный хук для доступа.

## Реализация (Пример)

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useProxyContext } from '../context/ProxyContext';

export const ProxyItem = ({ proxy }) => {
  const { t } = useTranslation();
  const { connect } = useProxyContext();

  return (
    <div className="p-2 border-b border-zinc-800 flex justify-between">
      <span className="text-zinc-200 font-mono">{proxy.ip}</span>
      <button 
        onClick={() => connect(proxy)}
        className="text-green-600 hover:text-green-400 font-medium"
      >
        {t('common.connect')}
      </button>
    </div>
  );
};
```

## Распространенные ошибки
- **Prop Drilling**: Передача данных через промежуточные компоненты. *Решение: Context.*
- **Inline Logic**: Сложные вычисления или `useEffect` прямо в теле компонента. *Решение: Custom Hook.*
- **Static Strings**: Использование хардкодных строк. *Решение: i18next.*
- **Ad-hoc Styling**: Использование стилей вне системы Tailwind. *Решение: Использование дизайн токенов.*

## Список признаков (Red Flags)
- Компонент занимает более 100 строк.
- В одном компоненте смешаны стили, логика API и обработка UI.
- Используется более 3 пропсов для передачи данных вглубь дерева.
