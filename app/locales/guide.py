from __future__ import annotations

# The button-syntax guide is built from English semantic keys after the normal
# Arabic -> English normalization. Locale-specific packs can override every
# visible fragment without touching editor/router code.
GUIDE_TRANSLATIONS: dict[str, dict[str, str]] = {
    "fr": {
        "Send the message you want to customize. You can place button syntax anywhere in the text.": "Envoyez le message que vous souhaitez personnaliser. Vous pouvez placer la syntaxe des boutons n’importe où dans le texte.",
        "📘 Inline button guide — tap to open": "📘 Guide des boutons intégrés — appuyez pour ouvrir",
        "Syntax: {button name:type value#color}": "Syntaxe : {nom du bouton:type valeur#couleur}",
        "{Button name:url https://example.com#b}": "{Nom du bouton:url https://example.com#b}",
        "{Profile:user#p}": "{Profil:user#p}",
        "{Action:callback_data action:1#r}": "{Action:callback_data action:1#r}",
        "{Next page:cbd a86d3132#b}": "{Page suivante:cbd a86d3132#b}",
        "{Subscribers only:cbd a86d3132#b sub}": "{Abonnés uniquement:cbd a86d3132#b sub}",
        "{Alert:popup This is the alert text#r}": "{Alerte:popup Ceci est le texte de l’alerte#r}",
        "{Copy:copy text to copy#g}": "{Copier:copy texte à copier#g}",
        "{Search:switch_inline_query search words}": "{Rechercher:switch_inline_query mots de recherche}",
        "{Search here:switch_inline_query_current_chat search words}": "{Rechercher ici:switch_inline_query_current_chat mots de recherche}",
        "{Disabled:disabled#r}": "{Désactivé:disabled#r}",
        "Two buttons side by side:": "Deux boutons côte à côte :",
        "{Accept:callback_data yes#g} {Reject:callback_data no#r}": "{Accepter:callback_data yes#g} {Refuser:callback_data no#r}",
        "Colors: #r red, #b or #p blue, #g green, and no code for the default color.": "Couleurs : #r rouge, #b ou #p bleu, #g vert, et aucun code pour la couleur par défaut.",
        "📘 Inline button guide:": "📘 Guide des boutons intégrés :",
    },
}
