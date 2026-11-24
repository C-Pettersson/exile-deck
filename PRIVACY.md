# Privacy

Exile Deck collects no analytics, has no account and stores no personal data on a server.

- **Network:** it requests public price and boss data from `poe.how` and item images from `poe.how` and
  `web.poecdn.com`. Like any web request, these include your IP address and a `User-Agent` naming the plugin and its
  version. Keys that open a website hand the address to your browser.
- **Clipboard:** it is read and written only when you press Price check, Chat command or Regex search.
  A hold on an empty Regex search key saves the clipboard text in that key's settings, and it is shown on the key. Previous text is restored
  afterwards. Item text is matched on your computer and is not uploaded. A price check does request the price list of
  the item's category.
- **Local files:** cached prices, images and a small log are kept in `%LOCALAPPDATA%\ExileDeck`. The log can contain
  names of items you price checked. Delete the folder at any time.

Questions: open an issue on the project's GitHub page.
