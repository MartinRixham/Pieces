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

		var currentIndex = 0;

		var activeIndex = new Library.Datum(-1);

		var router;

		var currentElement = null;

		var oldElement = null;

		this.currentPage = null;

		this.oldPage = null;

		this.onBind = function(element) {

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			var route = Route.get();

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			currentElement = document.createElement("DIV");
			currentElement.dataset.bind = "currentPage";

			oldElement = document.createElement("DIV");
			oldElement.dataset.bind = "oldPage";
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
					get: function() {

						return pages[currentIndex].route;
					}
				});
		};

		function routePage(hash, callback) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					activeIndex(i);

					setPage(i, callback);

					return;
				}
			}

			activeIndex(-1);

			setPage(0, callback);
		}

		function setPage(index, callback) {

			if (self.currentPage == pages[index].page) {

				return;
			}

			callback();
			self.currentPage = pages[index].page;
			currentIndex = index;
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			activeIndex(index);

			var oldIndex = currentIndex;

			if (oldIndex != index) {

				router.changePage();
			}

			currentIndex = index;

			router.update();

			oldElement.style.opacity = "1";
			oldElement.style.removeProperty("transition");

			oldElement.style.width =
				oldElement.parentElement.offsetWidth + "px";

			currentElement.style.opacity = "0";
			currentElement.style.removeProperty("transition");

			this.currentPage = {};

			var oldPage = getOldPage(currentElement);

			this.oldPage = new Placeholder(oldPage);
			this.currentPage = pages[index].page;

			setTimeout(function() {

				oldElement.style.opacity = "0";
				oldElement.style.transition = "opacity 0.5s";

				currentElement.style.opacity = "1";
				currentElement.style.transition = "opacity 0.5s";

				setTimeout(function() {

					self.oldPage = null;
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
