define([
	"./Library",
	"./Route",
	"./Placeholder"],
function FadeNavPiece(
	Library,
	Route,
	Placeholder) {

	var route = new Route();

	function FadeNavPiece(pages) {

		var self = this;

		var currentIndex = new Library.Datum(0);

		var activeIndex = new Library.Datum(-1);

		var routeIndex = -1;

		var currentElement = null;

		var oldElement = null;

		this.currentPage = pages[0].page;

		this.oldPage = null;

		this.onBind = function(element) {

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

			routeIndex =
				route.addRoute({

					set: function(word, routeIndex) {

						routePage(word);
						route.update(routeIndex);
					},
					get: function() {

						return pages[currentIndex()].route;
					}
				});
		};

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					self.currentPage = pages[i].page;
					currentIndex(i);
					activeIndex(i);

					return;
				}
			}

			self.currentPage = pages[0].page;
			currentIndex(0);
			activeIndex(-1);
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			activeIndex(index);

			var oldIndex = currentIndex();

			if (oldIndex != index) {

				route.changePage(routeIndex);
			}

			currentIndex(index);

			route.update(routeIndex);

			oldElement.style.opacity = "1";
			oldElement.style.removeProperty("transition");

			oldElement.style.width =
				oldElement.parentElement.offsetWidth + "px";

			currentElement.style.opacity = "0";
			currentElement.style.removeProperty("transition");

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
			});
		};

		function getOldPage(element) {

			var children = element.children;
			var oldPage = new Array(children.length);

			for(var i = children.length - 1; i >= 0; i--) {

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
