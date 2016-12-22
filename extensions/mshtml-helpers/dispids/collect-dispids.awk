BEGIN {
    print "#define MINLONG 0x80000000\
    #define DISPID_BACKCOLOR 0xFFFFFE0B\
    #define DISPID_CLICK 0xFFFFFDA8\
    #define DISPID_DBLCLICK 0xFFFFFDA7\
    #define DISPID_KEYDOWN 0xFFFFFDA6\
    #define DISPID_KEYPRESS 0xFFFFFDA5\
    #define DISPID_KEYUP 0xFFFFFDA4\
    #define DISPID_MOUSEDOWN 0xFFFFFDA3\
    #define DISPID_MOUSEMOVE 0xFFFFFDA2\
    #define DISPID_MOUSEUP 0xFFFFFDA1\
    #define DISPID_READYSTATECHANGE 0xFFFFFD9F\
    #define EVENTID_CommonCtrlEvent_BeforeDragOver 3\
    #define EVENTID_CommonCtrlEvent_BeforeDropOrPaste 4\
    #define DomConstructorObject 0\
    #define DomConstructorAttr 1\
    #define DomConstructorBehaviorUrnsCollection 2\
    #define DomConstructorBookmarkCollection 3\
    #define DomConstructorCompatibleInfo 4\
    #define DomConstructorCompatibleInfoCollection 5\
    #define DomConstructorControlRangeCollection 6\
    #define DomConstructorCSSCurrentStyleDeclaration 7\
    #define DomConstructorCSSRuleList 8\
    #define DomConstructorCSSRuleStyleDeclaration 9\
    #define DomConstructorCSSStyleDeclaration 10\
    #define DomConstructorCSSStyleRule 11\
    #define DomConstructorCSSStyleSheet 12\
    #define DomConstructorDataTransfer 13\
    #define DomConstructorDOMImplementation 14\
    #define DomConstructorElement 15\
    #define DomConstructorEvent 16\
    #define DomConstructorHistory 17\
    #define DomConstructorHTCElementBehaviorDefaults 18\
    #define DomConstructorHTMLAnchorElement 19\
    #define DomConstructorHTMLAreaElement 20\
    #define DomConstructorHTMLAreasCollection 21\
    #define DomConstructorHTMLBaseElement 22\
    #define DomConstructorHTMLBaseFontElement 23\
    #define DomConstructorHTMLBGSoundElement 24\
    #define DomConstructorHTMLBlockElement 25\
    #define DomConstructorHTMLBodyElement 26\
    #define DomConstructorHTMLBRElement 27\
    #define DomConstructorHTMLButtonElement 28\
    #define DomConstructorHTMLCollection 29\
    #define DomConstructorHTMLCommentElement 30\
    #define DomConstructorHTMLDDElement 31\
    #define DomConstructorHTMLDivElement 32\
    #define DomConstructorHTMLDocument 33\
    #define DomConstructorHTMLDListElement 34\
    #define DomConstructorHTMLDTElement 35\
    #define DomConstructorHTMLEmbedElement 36\
    #define DomConstructorHTMLFieldSetElement 37\
    #define DomConstructorHTMLFontElement 38\
    #define DomConstructorHTMLFormElement 39\
    #define DomConstructorHTMLFrameElement 40\
    #define DomConstructorHTMLFrameSetElement 41\
    #define DomConstructorHTMLGenericElement 42\
    #define DomConstructorHTMLHeadElement 43\
    #define DomConstructorHTMLHeadingElement 44\
    #define DomConstructorHTMLHRElement 45\
    #define DomConstructorHTMLHtmlElement 46\
    #define DomConstructorHTMLIFrameElement 47\
    #define DomConstructorHTMLImageElement 48\
    #define DomConstructorHTMLInputElement 49\
    #define DomConstructorHTMLIsIndexElement 50\
    #define DomConstructorHTMLLabelElement 51\
    #define DomConstructorHTMLLegendElement 52\
    #define DomConstructorHTMLLIElement 53\
    #define DomConstructorHTMLLinkElement 54\
    #define DomConstructorHTMLMapElement 55\
    #define DomConstructorHTMLMarqueeElement 56\
    #define DomConstructorHTMLMetaElement 57\
    #define DomConstructorHTMLModelessDialog 58\
    #define DomConstructorHTMLNamespaceInfo 59\
    #define DomConstructorHTMLNamespaceInfoCollection 60\
    #define DomConstructorHTMLNextIdElement 61\
    #define DomConstructorHTMLNoShowElement 62\
    #define DomConstructorHTMLObjectElement 63\
    #define DomConstructorHTMLOListElement 64\
    #define DomConstructorHTMLOptionElement 65\
    #define DomConstructorHTMLParagraphElement 66\
    #define DomConstructorHTMLParamElement 67\
    #define DomConstructorHTMLPhraseElement 68\
    #define DomConstructorHTMLPluginsCollection 69\
    #define DomConstructorHTMLPopup 70\
    #define DomConstructorHTMLScriptElement 71\
    #define DomConstructorHTMLSelectElement 72\
    #define DomConstructorHTMLSpanElement 73\
    #define DomConstructorHTMLStyleElement 74\
    #define DomConstructorHTMLTableCaptionElement 75\
    #define DomConstructorHTMLTableCellElement 76\
    #define DomConstructorHTMLTableColElement 77\
    #define DomConstructorHTMLTableElement 78\
    #define DomConstructorHTMLTableRowElement 79\
    #define DomConstructorHTMLTableSectionElement 80\
    #define DomConstructorHTMLTextAreaElement 81\
    #define DomConstructorHTMLTextElement 82\
    #define DomConstructorHTMLTitleElement 83\
    #define DomConstructorHTMLUListElement 84\
    #define DomConstructorHTMLUnknownElement 85\
    #define DomConstructorImage 86\
    #define DomConstructorLocation 87\
    #define DomConstructorNamedNodeMap 88\
    #define DomConstructorNavigator 89\
    #define DomConstructorNodeList 90\
    #define DomConstructorOption 91\
    #define DomConstructorScreen 92\
    #define DomConstructorSelection 93\
    #define DomConstructorStaticNodeList 94\
    #define DomConstructorStorage 95\
    #define DomConstructorStyleSheetList 96\
    #define DomConstructorStyleSheetPage 97\
    #define DomConstructorStyleSheetPageList 98\
    #define DomConstructorText 99\
    #define DomConstructorTextRange 100\
    #define DomConstructorTextRangeCollection 101\
    #define DomConstructorTextRectangle 102\
    #define DomConstructorTextRectangleList 103\
    #define DomConstructorWindow 104\
    #define DomConstructorXDomainRequest 105\
    #define DomConstructorXMLHttpRequest 106\
    #define DomConstructorMax 107\
    #define c_edgeEventsStart MSHTML.GetDispIdValue(\"DISPID_EVPROPS_COUNT\")"
}
FNR ==1 {
    print "#define _hxx_"
    print "#include \"" FILENAME "\"";
}
/^#define DISPID_[A-z_]+ .+/ && !/DISPID_HTMLOPTIONBUTTONELEMENTEVENTS_ONCHANGE/ {
    print "\"" $2 "\", " $2;
}