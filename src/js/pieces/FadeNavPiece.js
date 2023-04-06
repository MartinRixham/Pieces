define([
	"./Library",
	"./Route",
	"./Placeholder"
],
function FadeNavPiece(
	Library,
	Route,
	Placeholder) {

	function FadeNavPiece(pages) {

		var self = this;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var router;

		var currentElement = null;

		var oldElement = null;

		this.datumPiecesNewPage = null;

		this.datumPiecesOldPage = null;

		this.onBind = function(element) {

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			var route = Route.get();

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			currentElement = document.createElement("DIV");
			currentElement.dataset.bind = "datumPiecesNewPage";

			oldElement = document.createElement("DIV");
			oldElement.dataset.bind = "datumPiecesOldPage";
			oldElement.style.position = "absolute";

			element.appendChild(oldElement);
			element.appendChild(currentElement);
			element.style.position = "relative";
			element.style.paddingTop = "1px";

			router =
				route.addRoute({

					set: function(word, routeIndex, callback) {

						routePage(word, callback);
						route.update(routeIndex);
					},
					get: function(nonBlank) {

						if (nonBlank && currentIndex < 0) {

							return pages[0].route;
						}
						else if (pages[currentIndex]) {

							return pages[currentIndex].route;
						}
						else {

							return "";
						}
					}
				});
		};

		function routePage(hash, callback) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					currentIndex = i;
					activeIndex(i);

					setPage(i, callback);

					return;
				}
			}

			if (!self.datumPiecesNewPage) {

				setPage(0, callback);
			}
		}

		function setPage(index, callback) {

			var page = pages[index].page;

			if (typeof page == "function") {
				page = page();
				pages[index].page = page;
			}

			if (self.datumPiecesNewPage == page) {

				return;
			}

			callback();
			self.datumPiecesNewPage = page;
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			var page = pages[index].page;

			if (typeof page == "function") {
				page = page();
				pages[index].page = page;
			}

			var oldIndex = Math.max(currentIndex, 0);

			currentIndex = index;
			activeIndex(index);

			if (oldIndex != index) {

				router.changePage();
			}

			router.update();

			oldElement.style.opacity = "1";
			oldElement.style.removeProperty("transition");

			oldElement.style.width =
				oldElement.parentElement.offsetWidth + "px";

			currentElement.style.opacity = "0";
			currentElement.style.removeProperty("transition");

			this.datumPiecesNewPage = {};

			var oldPage = getOldPage(currentElement);

			this.datumPiecesOldPage = new Placeholder(oldPage);
			this.datumPiecesNewPage = page;

			setTimeout(function() {

				oldElement.style.opacity = "0";
				oldElement.style.transition = "opacity 0.5s";

				currentElement.style.opacity = "1";
				currentElement.style.transition = "opacity 0.5s";

				setTimeout(function() {

					self.datumPiecesOldPage = null;
				}, 500);
			}, 10);
		};

		function getOldPage(element) {

			var children = element.children;
			var oldPage = new Array(children.length);

			for (var i = children.length - 1; i >= 0; i--) {

				oldPage[i] = children[i];
				element.removeChild(children[i]);
			}

			return oldPage;
		}

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return FadeNavPiece;
});
